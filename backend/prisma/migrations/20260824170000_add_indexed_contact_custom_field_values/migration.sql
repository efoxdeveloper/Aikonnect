CREATE TABLE "contact_custom_field_values" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "field_id" UUID NOT NULL,
  "text_value" TEXT,
  "number_value" DOUBLE PRECISION,
  "date_value" DATE,
  "boolean_value" BOOLEAN,
  "string_values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "contact_custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_custom_field_values_contact_id_field_id_key"
ON "contact_custom_field_values"("contact_id", "field_id");

CREATE INDEX "contact_custom_field_values_workspace_id_field_id_text_value_contact_id_idx"
ON "contact_custom_field_values"("workspace_id", "field_id", "text_value", "contact_id");

CREATE INDEX "contact_custom_field_values_workspace_id_field_id_number_value_contact_id_idx"
ON "contact_custom_field_values"("workspace_id", "field_id", "number_value", "contact_id");

CREATE INDEX "contact_custom_field_values_workspace_id_field_id_date_value_contact_id_idx"
ON "contact_custom_field_values"("workspace_id", "field_id", "date_value", "contact_id");

CREATE INDEX "contact_custom_field_values_workspace_id_field_id_boolean_value_contact_id_idx"
ON "contact_custom_field_values"("workspace_id", "field_id", "boolean_value", "contact_id");

CREATE INDEX "contact_custom_field_values_contact_id_idx"
ON "contact_custom_field_values"("contact_id");

CREATE INDEX "contact_custom_field_values_string_values_idx"
ON "contact_custom_field_values" USING GIN ("string_values");

ALTER TABLE "contact_custom_field_values"
ADD CONSTRAINT "contact_custom_field_values_contact_id_fkey"
FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_custom_field_values"
ADD CONSTRAINT "contact_custom_field_values_field_id_fkey"
FOREIGN KEY ("field_id") REFERENCES "contact_custom_fields"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

WITH values_to_backfill AS (
  SELECT
    md5(c."id"::text || ':' || f."id"::text)::uuid AS "id",
    c."workspace_id",
    c."id" AS "contact_id",
    f."id" AS "field_id",
    CASE
      WHEN f."type" IN ('TEXT', 'SELECT') AND jsonb_typeof(c."custom_attributes" -> f."key") = 'string'
      THEN c."custom_attributes" ->> f."key"
    END AS "text_value",
    CASE
      WHEN f."type" = 'NUMBER' AND jsonb_typeof(c."custom_attributes" -> f."key") = 'number'
      THEN (c."custom_attributes" ->> f."key")::double precision
    END AS "number_value",
    CASE
      WHEN f."type" = 'DATE'
        AND jsonb_typeof(c."custom_attributes" -> f."key") = 'string'
        AND (c."custom_attributes" ->> f."key") ~ '^\d{4}-\d{2}-\d{2}$'
        AND to_char(to_date(c."custom_attributes" ->> f."key", 'YYYY-MM-DD'), 'YYYY-MM-DD') = c."custom_attributes" ->> f."key"
      THEN (c."custom_attributes" ->> f."key")::date
    END AS "date_value",
    CASE
      WHEN f."type" = 'BOOLEAN' AND jsonb_typeof(c."custom_attributes" -> f."key") = 'boolean'
      THEN (c."custom_attributes" ->> f."key")::boolean
    END AS "boolean_value",
    CASE
      WHEN f."type" = 'MULTI_SELECT' AND jsonb_typeof(c."custom_attributes" -> f."key") = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(c."custom_attributes" -> f."key"))
      ELSE ARRAY[]::TEXT[]
    END AS "string_values",
    c."created_at",
    c."updated_at"
  FROM "contacts" c
  JOIN "contact_custom_fields" f
    ON f."workspace_id" = c."workspace_id"
   AND c."custom_attributes" ? f."key"
)
INSERT INTO "contact_custom_field_values" (
  "id", "workspace_id", "contact_id", "field_id", "text_value", "number_value",
  "date_value", "boolean_value", "string_values", "created_at", "updated_at"
)
SELECT
  "id", "workspace_id", "contact_id", "field_id", "text_value", "number_value",
  "date_value", "boolean_value", "string_values", "created_at", "updated_at"
FROM values_to_backfill
WHERE "text_value" IS NOT NULL
   OR "number_value" IS NOT NULL
   OR "date_value" IS NOT NULL
   OR "boolean_value" IS NOT NULL
   OR cardinality("string_values") > 0;
