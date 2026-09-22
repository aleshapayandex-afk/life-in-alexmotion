#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cf-ai.py - вызов модели Cloudflare Workers AI по REST из локального окружения.

Зачем. Финальный независимый каскад (methodology/final-review.md) требует, чтобы
редактуру делала модель ДРУГОГО семейства в отдельном процессе. В этом проекте
такая модель - `qa.final_review.editor_model` из config.yaml (Workers AI). Бот
дёргает её биндингом `env.AI.run()`, но биндинг доступен только коду внутри
задеплоенного Worker. Снаружи остаётся REST:

    POST https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/run/<MODEL>

Формат запроса и разбор ответа повторяют src/lib/ai.ts: messages + max_tokens,
ответ читается и как {"response": ...}, и как Chat Completions {"choices": [...]}.

Учётные данные (CF_ACCOUNT_ID, CF_API_TOKEN) берутся из окружения, иначе из
.dev.vars проекта. Скрипт их НИКОГДА не печатает - ни в ошибках, ни в отладке.

Использование:
  py statejnik/tools/cf-ai.py --system work/<slug>/editor-prompt.md --user work/<slug>/draft.md
  py statejnik/tools/cf-ai.py --user work/<slug>/draft.md --model @cf/meta/llama-3.3-70b-instruct-fp8-fast
  echo "текст" | py statejnik/tools/cf-ai.py --system prompt.md

Коды выхода: 0 - ответ получен; 2 - ошибка ввода; 3 - нет учётных данных;
4 - ошибка API или пустой ответ.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _config as cfgmod  # noqa: E402

API = "https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/{model}"
DEFAULT_MAX_TOKENS = 3000
TIMEOUT = 120


def find_env_file(explicit=None):
    """Найти .dev.vars: явный путь → ./.dev.vars → на уровень выше (если запустили из statejnik/)."""
    here = os.path.dirname(os.path.abspath(__file__))
    for c in (explicit,
              os.path.join(os.getcwd(), ".dev.vars"),
              os.path.join(os.path.dirname(os.path.dirname(here)), ".dev.vars")):
        if c and os.path.isfile(c):
            return c
    return None


def read_credentials(env_file):
    """Достать account_id и token. Приоритет у переменных окружения. Значения наружу не отдаются."""
    acct = os.environ.get("CF_ACCOUNT_ID")
    token = os.environ.get("CF_API_TOKEN")
    if acct and token:
        return acct, token, "окружение"
    path = find_env_file(env_file)
    if path:
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    v = v.strip().strip('"').strip("'")
                    if k.strip() == "CF_ACCOUNT_ID" and not acct:
                        acct = v
                    elif k.strip() == "CF_API_TOKEN" and not token:
                        token = v
        except OSError:
            pass
        if acct and token:
            return acct, token, path
    return acct, token, path


def call(acct, token, model, messages, max_tokens):
    """Один запрос к Workers AI. Возвращает текст ответа. Токен в сообщениях об ошибке не появляется."""
    body = json.dumps({"messages": messages, "max_tokens": max_tokens}).encode("utf-8")
    req = urllib.request.Request(
        API.format(acct=acct, model=model),
        data=body,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        raise SystemExit("HTTP %s от Workers AI: %s" % (e.code, detail))
    except urllib.error.URLError as e:
        raise SystemExit("сеть недоступна: %s" % e.reason)

    if not payload.get("success", True):
        raise SystemExit("API вернул ошибку: %s" % json.dumps(payload.get("errors"), ensure_ascii=False))

    res = payload.get("result") or {}
    text = res.get("response")
    if not text:
        choices = res.get("choices") or []
        if choices:
            text = (choices[0].get("message") or {}).get("content")
    if not text or not text.strip():
        raise SystemExit("пустой ответ модели (усечён по max_tokens? модель тратит бюджет на reasoning)")
    return text.strip()


def main():
    p = argparse.ArgumentParser(
        description="Вызов модели Cloudflare Workers AI по REST (для финального каскада редактуры).",
        epilog="Модель: флаг --model → config.yaml (qa.final_review.editor_model). "
               "Учётные данные: CF_ACCOUNT_ID и CF_API_TOKEN из окружения или .dev.vars.",
    )
    p.add_argument("--system", metavar="FILE", help="файл с системным промптом (роль редактора)")
    p.add_argument("--user", metavar="FILE", help="файл с пользовательским сообщением; без него читается stdin")
    p.add_argument("--model", default=None, help="id модели Workers AI")
    p.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS, help="лимит ответа")
    p.add_argument("--config", default=None, help="путь к config.yaml")
    p.add_argument("--env-file", default=None, help="путь к файлу с CF_ACCOUNT_ID / CF_API_TOKEN")
    p.add_argument("--check", action="store_true", help="только проверить доступ и выйти")
    args = p.parse_args()

    cfg = cfgmod.load_config(args.config or cfgmod.find_config())
    model = args.model or cfgmod.get(cfg, "qa.final_review.editor_model")
    if not model:
        sys.stderr.write("не задана модель: ни --model, ни qa.final_review.editor_model в config.yaml\n")
        sys.exit(2)

    acct, token, where = read_credentials(args.env_file)
    if not acct or not token:
        missing = [n for n, v in (("CF_ACCOUNT_ID", acct), ("CF_API_TOKEN", token)) if not v]
        sys.stderr.write(
            "нет учётных данных Cloudflare: %s\n"
            "Искал в переменных окружения и в %s\n"
            "Account ID: npx wrangler whoami (или dash.cloudflare.com -> Workers & Pages, блок Account ID).\n"
            "Токен: dash.cloudflare.com -> My Profile -> API Tokens -> Create Custom Token, "
            "право Account / Workers AI / Read.\n"
            % (", ".join(missing), where or ".dev.vars (не найден)")
        )
        sys.exit(3)

    if args.check:
        out = call(acct, token, model, [{"role": "user", "content": "Ответь одним словом: готов"}], 32)
        print("доступ есть. модель %s, учётные данные из: %s" % (model, where))
        print("ответ модели: %s" % out[:120])
        sys.exit(0)

    messages = []
    if args.system:
        if not os.path.isfile(args.system):
            sys.stderr.write("нет файла: %s\n" % args.system)
            sys.exit(2)
        messages.append({"role": "system", "content": open(args.system, encoding="utf-8").read()})

    if args.user:
        if not os.path.isfile(args.user):
            sys.stderr.write("нет файла: %s\n" % args.user)
            sys.exit(2)
        user = open(args.user, encoding="utf-8").read()
    else:
        user = sys.stdin.read()
    if not user.strip():
        sys.stderr.write("пустое пользовательское сообщение\n")
        sys.exit(2)
    messages.append({"role": "user", "content": user})

    print(call(acct, token, model, messages, args.max_tokens))


if __name__ == "__main__":
    main()
