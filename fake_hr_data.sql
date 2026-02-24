INSERT INTO public.metrics (id, user_id, metric_type, ts, value, unit)
WITH gen AS (
  -- paste the query above, but select only (user_id, metric_type, ts, value, unit)
  WITH u AS (
    SELECT id, age FROM public.users
    WHERE id = '1e35311e-5277-471c-80c2-5f0aea256af0'::uuid
  ),
  params AS (
    SELECT now() - interval '1 hour' AS start_ts, 60 AS minutes, (220 - u.age) AS hr_max
    FROM u
  ),
  minutes AS (
    SELECT (p.start_ts + (gs.i || ' minutes')::interval) AS ts, p.hr_max
    FROM params p
    CROSS JOIN LATERAL generate_series(0, (SELECT minutes FROM params) - 1) AS gs(i)
  ),
  target AS (
    SELECT m.ts, m.hr_max,
      CASE
        WHEN EXTRACT(minute FROM m.ts - (SELECT start_ts FROM params)) < 10 THEN 0.60
        WHEN EXTRACT(minute FROM m.ts - (SELECT start_ts FROM params)) < 25 THEN 0.72
        WHEN EXTRACT(minute FROM m.ts - (SELECT start_ts FROM params)) < 45 THEN
          CASE WHEN (EXTRACT(minute FROM m.ts - (SELECT start_ts FROM params))::int % 4) IN (0,1) THEN 0.90 ELSE 0.78 END
        WHEN EXTRACT(minute FROM m.ts - (SELECT start_ts FROM params)) < 55 THEN 0.80
        ELSE 0.62
      END AS intensity
    FROM minutes m
  ),
  hr AS (
    SELECT t.ts,
      LEAST(t.hr_max::float, GREATEST(45.0, (t.hr_max * t.intensity) + (random() * 6 - 3))) AS bpm
    FROM target t
  )
  SELECT
  -- This is the line which references Mahyar's user in the DB to upload, which you can find in PGAdmin --
    '1e35311e-5277-471c-80c2-5f0aea256af0'::uuid AS user_id, 
    'heart_rate'::text AS metric_type,
    ts,
    bpm AS value,
    'bpm'::text AS unit
  FROM hr
)
SELECT gen_random_uuid(), user_id, metric_type, ts, value, unit
FROM gen;
