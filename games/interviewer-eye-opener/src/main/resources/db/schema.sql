CREATE TABLE IF NOT EXISTS world_run (
    run_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    world_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    strategy VARCHAR(32) NOT NULL,
    scenario_id VARCHAR(32) NOT NULL,
    scenario_sha256 CHAR(64) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (run_id, world_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_like_count (
    run_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    world_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    work_id BIGINT NOT NULL,
    like_count BIGINT NOT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (run_id, world_id, work_id),
    CONSTRAINT fk_count_world FOREIGN KEY (run_id, world_id)
        REFERENCES world_run (run_id, world_id),
    CONSTRAINT ck_like_count_non_negative CHECK (like_count >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS like_state (
    run_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    world_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    work_id BIGINT NOT NULL,
    user_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    liked BOOLEAN NOT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (run_id, world_id, work_id, user_id),
    CONSTRAINT fk_state_world FOREIGN KEY (run_id, world_id)
        REFERENCES world_run (run_id, world_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_record (
    run_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    world_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    request_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    user_id VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    work_id BIGINT NOT NULL,
    operation VARCHAR(16) NOT NULL,
    decision VARCHAR(16) NULL,
    effect VARCHAR(32) NULL,
    liked_after BOOLEAN NULL,
    count_after BIGINT NULL,
    reason VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at DATETIME(6) NULL,
    PRIMARY KEY (run_id, world_id, request_id),
    CONSTRAINT fk_request_world FOREIGN KEY (run_id, world_id)
        REFERENCES world_run (run_id, world_id)
) ENGINE=InnoDB;
