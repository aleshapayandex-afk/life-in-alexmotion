#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
to-inbox.py - кладёт текст из локальной сессии в inbox бота (Cloudflare D1).

Зачем. «Скилл статей» и ручная работа в терминале рождают материал, который
дальше живёт в боте: сырьё для /draft или уже готовый текст. Раньше его
приходилось пересылать себе в Telegram руками.

Почему hex, а не кавычки. `wrangler d1 execute` не умеет bind-параметры: SQL
собирается строкой. Ручное экранирование апострофов в тексте с переносами строк
и эмодзи - классический способ молча испортить данные. Поэтому текст уезжает
hex-литералом: `CAST(X'd0bf...' AS TEXT)`. В полезной нагрузке не остаётся ни
одной кавычки, экранировать нечего.

Почему файл, а не --command. Пост на 2000 знаков кириллицы превращается в
8000+ шестнадцатеричных символов, а cmd.exe обрывает командную строку на 8191.
SQL уходит временным .sql файлом через --file.

По умолчанию пишем в ЛОКАЛЬНУЮ базу. В прод - только с явным --remote.

Использование:
  py statejnik/tools/to-inbox.py work/<slug>/draft.md --kind post
  py statejnik/tools/to-inbox.py notes.md                       # сырьё, локально
  py statejnik/tools/to-inbox.py notes.md --remote              # в прод
  echo "идея" | py statejnik/tools/to-inbox.py - --dry-run      # показать SQL

Коды выхода: 0 - записано; 2 - ошибка ввода; 3 - wrangler вернул ошибку.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile

DEFAULT_DB = "alexmotion"
KINDS = ("raw", "post")


def database_name(wrangler_toml="wrangler.toml"):
    """Имя базы из wrangler.toml, чтобы не расходилось с конфигом Worker."""
    try:
        with open(wrangler_toml, encoding="utf-8") as f:
            m = re.search(r'^\s*database_name\s*=\s*"([^"]+)"', f.read(), re.M)
            if m:
                return m.group(1)
    except OSError:
        pass
    return DEFAULT_DB


def build_sql(text, kind):
    """INSERT с текстом в виде hex-литерала плюс подтверждающий SELECT."""
    blob = text.encode("utf-8").hex()
    return (
        "INSERT INTO inbox (text, kind, status) "
        "VALUES (CAST(X'{hex}' AS TEXT), '{kind}', 'new');\n"
        "SELECT id, kind, substr(text, 1, 60) AS preview FROM inbox "
        "ORDER BY id DESC LIMIT 1;\n"
    ).format(hex=blob, kind=kind)


def run_wrangler(sql, db, remote):
    """Отдать SQL wrangler-у файлом. Возвращает код возврата."""
    fd, path = tempfile.mkstemp(suffix=".sql", text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(sql)
        cmd = [
            "npx", "wrangler", "d1", "execute", db,
            "--remote" if remote else "--local",
            "--file=" + path,
        ]
        sys.stderr.write("выполняю: %s\n" % " ".join(cmd[:-1] + ["--file=<временный .sql>"]))
        return subprocess.call(cmd, shell=(os.name == "nt"))
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def main():
    p = argparse.ArgumentParser(
        description="Запись материала в inbox бота (Cloudflare D1).",
        epilog="По умолчанию пишет в локальную базу. Прод - только с --remote.",
    )
    p.add_argument("file", help="файл с текстом, либо - для чтения stdin")
    p.add_argument("--kind", default="raw", choices=KINDS,
                   help="raw - сырьё для /draft (по умолчанию), post - готовый текст")
    p.add_argument("--remote", action="store_true",
                   help="писать в ПРОДОВУЮ базу вместо локальной")
    p.add_argument("--database", default=None, help="имя базы D1 (по умолчанию из wrangler.toml)")
    p.add_argument("--dry-run", action="store_true", help="показать SQL и выйти, ничего не писать")
    args = p.parse_args()

    if args.file == "-":
        text = sys.stdin.read()
    else:
        if not os.path.isfile(args.file):
            sys.stderr.write("нет файла: %s\n" % args.file)
            sys.exit(2)
        with open(args.file, encoding="utf-8") as f:
            text = f.read()

    text = text.strip()
    if not text:
        sys.stderr.write("пустой текст - нечего класть в inbox\n")
        sys.exit(2)

    sql = build_sql(text, args.kind)

    if args.dry_run:
        sys.stdout.write(sql)
        sys.stderr.write("dry-run: ничего не записано (%d символов, kind=%s)\n"
                         % (len(text), args.kind))
        sys.exit(0)

    db = args.database or database_name()
    where = "ПРОД" if args.remote else "локальную"
    sys.stderr.write("пишу в %s базу %s: kind=%s, %d символов\n"
                     % (where, db, args.kind, len(text)))

    code = run_wrangler(sql, db, args.remote)
    if code != 0:
        sys.stderr.write(
            "wrangler вернул %d. Если это «Not logged in» - прогони: npx wrangler login\n" % code
        )
        sys.exit(3)


if __name__ == "__main__":
    main()
