INSERT INTO "subscription_plans" (
    "id", "name", "slug", "description", "currency",
    "monthly_price_minor_units", "annual_price_minor_units", "trial_days",
    "max_seats", "max_contacts", "max_campaigns_per_month", "max_automations", "max_workflows", "max_pipelines",
    "api_access", "webhooks", "advanced_reports", "active", "display_order", "updated_at"
) VALUES
    (
        '8dc97f5a-6673-4dd1-a7e7-7d58ddfc6dd1', 'Starter', 'starter', 'Draft plan. Set subscription pricing before activation.', 'INR',
        0, 0, 0, 2, 2000, 5, 3, 1, 1, false, false, false, false, 1, CURRENT_TIMESTAMP
    ),
    (
        'e78c5673-74eb-453d-a0e6-1e43427f2d8b', 'Growth', 'growth', 'Draft plan. Set subscription pricing before activation. Suggested free trial: 14 days.', 'INR',
        0, 0, 14, 5, 10000, 30, 20, 10, 3, true, true, true, false, 2, CURRENT_TIMESTAMP
    ),
    (
        '348952c7-0eb0-4fe9-81fa-5b595bacd9d5', 'Pro', 'pro', 'Draft plan. Set subscription pricing and capacity before activation.', 'INR',
        0, 0, 0, 15, 50000, 100, 100, 50, 10, true, true, true, false, 3, CURRENT_TIMESTAMP
    ),
    (
        '739e6c8c-7be5-48da-b604-f2d7556497f5', 'Enterprise', 'enterprise', 'Draft plan. Set contracted pricing and capacity before activation.', 'INR',
        0, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, true, true, true, false, 4, CURRENT_TIMESTAMP
    )
ON CONFLICT ("slug") DO NOTHING;
