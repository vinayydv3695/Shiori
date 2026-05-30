#!/bin/bash
sed -i 's/if current_version < 28 {/if current_version < 28 {\n            self.run_in_savepoint("v28", |mgr| mgr.migrate_to_v28())?;\n        }\n        if current_version < 29 {\n            self.run_in_savepoint("v29", |mgr| mgr.migrate_to_v29())?;/g' src-tauri/src/db/migrations.rs
