ALTER TABLE f5.clients ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
