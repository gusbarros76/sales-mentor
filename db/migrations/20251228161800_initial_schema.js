/* eslint-disable @typescript-eslint/no-var-requires */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("companies", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    name: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    company_id: {
      type: "uuid",
      notNull: true,
      references: "companies",
      onDelete: "CASCADE",
    },
    name: { type: "text", notNull: true },
    email: { type: "text", notNull: true },
    role: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint(
    "users",
    "users_role_check",
    "CHECK (role IN ('OWNER', 'MANAGER', 'AGENT'))"
  );
  pgm.addConstraint(
    "users",
    "users_company_email_unique",
    "UNIQUE (company_id, email)"
  );

  pgm.createTable("agents", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    company_id: {
      type: "uuid",
      notNull: true,
      references: "companies",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "uuid",
      references: "users",
      onDelete: "SET NULL",
    },
    display_name: { type: "text", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("calls", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    company_id: {
      type: "uuid",
      notNull: true,
      references: "companies",
      onDelete: "CASCADE",
    },
    agent_id: {
      type: "uuid",
      notNull: true,
      references: "agents",
      onDelete: "RESTRICT",
    },
    started_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    ended_at: { type: "timestamptz" },
    title: { type: "text" },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    status: { type: "text", notNull: true, default: "RUNNING" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint(
    "calls",
    "calls_status_check",
    "CHECK (status IN ('RUNNING', 'ENDED', 'FAILED'))"
  );
  pgm.createIndex(
    "calls",
    ["company_id", "agent_id", { name: "started_at", sort: "DESC" }],
    {
      name: "calls_company_agent_started_at_idx",
    }
  );

  pgm.createTable("segments", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    call_id: {
      type: "uuid",
      notNull: true,
      references: "calls",
      onDelete: "CASCADE",
    },
    source: { type: "text", notNull: true },
    speaker: { type: "text", notNull: true },
    start_ms: { type: "integer", notNull: true },
    end_ms: { type: "integer" },
    text: { type: "text", notNull: true },
    asr_confidence: { type: "numeric" },
    is_echo_suspected: { type: "boolean", notNull: true, default: false },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint(
    "segments",
    "segments_source_check",
    "CHECK (source IN ('MIC', 'TAB'))"
  );
  pgm.addConstraint(
    "segments",
    "segments_speaker_check",
    "CHECK (speaker IN ('VENDEDOR', 'CLIENTE'))"
  );
  pgm.createIndex("segments", ["call_id", "start_ms"], {
    name: "segments_call_start_ms_idx",
  });

  pgm.createTable("insights", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    call_id: {
      type: "uuid",
      notNull: true,
      references: "calls",
      onDelete: "CASCADE",
    },
    type: { type: "text", notNull: true },
    confidence: { type: "numeric" },
    quote: { type: "text", notNull: true },
    suggestions: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'[]'::jsonb"),
    },
    model: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    dedupe_key: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint(
    "insights",
    "insights_type_check",
    "CHECK (type IN ('BUYING_SIGNAL', 'HOW_IT_WORKS', 'PRICE', 'OBJECTION', 'NEXT_STEP', 'RISK', 'OTHER'))"
  );
  pgm.addConstraint(
    "insights",
    "insights_confidence_range_check",
    "CHECK ((confidence IS NULL) OR (confidence >= 0 AND confidence <= 1))"
  );
  pgm.createIndex(
    "insights",
    ["call_id", { name: "created_at", sort: "DESC" }],
    {
      name: "insights_call_created_at_idx",
    }
  );

  pgm.createTable("reports", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    call_id: {
      type: "uuid",
      notNull: true,
      references: "calls",
      onDelete: "CASCADE",
    },
    report_md: { type: "text" },
    report_json: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    model: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.addConstraint("reports", "reports_unique_call_id", "UNIQUE (call_id)");
};

exports.down = (pgm) => {
  pgm.dropTable("reports");
  pgm.dropTable("insights");
  pgm.dropTable("segments");
  pgm.dropTable("calls");
  pgm.dropTable("agents");
  pgm.dropTable("users");
  pgm.dropTable("companies");
  pgm.dropExtension("pgcrypto");
};
