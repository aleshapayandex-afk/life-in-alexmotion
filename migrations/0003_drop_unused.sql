-- 0003_drop_unused.sql — чистка схемы после удаления медиа и команды /publish.
-- posts больше никто не пишет (publish удалён). Медиа-столбцы inbox не используются
-- (принимаем только текст), rubric и kind тоже не заполняются.

DROP TABLE IF EXISTS posts;

ALTER TABLE inbox DROP COLUMN file_id;
ALTER TABLE inbox DROP COLUMN media_group_id;
ALTER TABLE inbox DROP COLUMN rubric;
ALTER TABLE inbox DROP COLUMN kind;
