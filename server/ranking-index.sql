-- Narrow rank candidates before parsing replay JSON or sorting player bests.
CREATE INDEX IF NOT EXISTS runs_rank_scope ON runs (
  COALESCE(json_extract(json, '$.mapKey'), CASE WHEN json_extract(json, '$.map.id') = 'rock_canyon_v1' OR json_extract(json, '$.mapVersion') = 'rock-canyon-v1'
              THEN 'rock-canyon' ELSE 'old-town' END),
  json_extract(json, '$.challenge.version'), json_extract(json, '$.challenge.id')
) WHERE reason IN ('time','caught','fell') AND score IS NOT NULL;
