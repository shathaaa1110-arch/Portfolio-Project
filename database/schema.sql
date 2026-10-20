-- users table
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    name TEXT NOT NULL,
    phone_number TEXT UNIQUE NOT NULL,
    push_token TEXT,
    created_at TIMESTAMP NOT NULL
);

-- groups table
CREATE TABLE IF NOT EXISTS groups (
    id uuid PRIMARY KEY,
    name TEXT NOT NULL,
    organizer_id uuid NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- group_members table
CREATE TABLE IF NOT EXISTS group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at TIMESTAMP NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

--outings table
CREATE TABLE IF NOT EXISTS outings (
    id uuid PRIMARY KEY,
    group_id uuid,
    organizer_id uuid NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    invite_code TEXT NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    district TEXT NOT NULL,
    tiebreak_ends_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- participants table
CREATE TABLE IF NOT EXISTS participants (
    id uuid PRIMARY KEY,
    outing_id uuid NOT NULL,
    user_id uuid,
    guest_name TEXT,
    attendance TEXT NOT NULL,
    preferences_done BOOLEAN NOT NULL,
    CHECK ((user_id IS NULL) <> (guest_name IS NULL)),
    CONSTRAINT participants_outing_user_unique UNIQUE (outing_id, user_id),
    FOREIGN KEY (outing_id) REFERENCES outings(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- preferences table
CREATE TABLE IF NOT EXISTS preferences (
    id uuid PRIMARY KEY,
    user_id uuid,
    participant_id uuid,
    liked_cuisines TEXT,
    allergies TEXT,
    budget_min INTEGER,
    budget_max INTEGER,
    max_distance_km INTEGER,
    seating_needs TEXT,
    CONSTRAINT preferences_user_unique UNIQUE (user_id),
    CONSTRAINT preferences_participant_unique UNIQUE (participant_id),
    CONSTRAINT preferences_exactly_one_owner CHECK (
        (user_id IS NULL) <> (participant_id IS NULL)
    ),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (participant_id) REFERENCES participants(id)
);

-- restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    brand_id INTEGER,
    cuisine TEXT NOT NULL,
    district TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    spend_low INTEGER NOT NULL,
    spend_high INTEGER NOT NULL,
    price_tier SMALLINT NOT NULL,
    rating NUMERIC,
    rating_count INTEGER,
    quality_score NUMERIC,
    group_fit INTEGER,
    meal_fit_breakfast SMALLINT,
    meal_fit_late_night SMALLINT,
    opening_hours JSONB,
    summary TEXT,
    maps_url TEXT NOT NULL
);

-- plan_items table
CREATE TABLE IF NOT EXISTS plan_items (
    id uuid PRIMARY KEY,
    outing_id uuid NOT NULL,
    restaurant_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    match_score INTEGER NOT NULL,
    reason TEXT NOT NULL,
    is_winner BOOLEAN NOT NULL,
    CONSTRAINT plan_items_outing_restaurant_unique UNIQUE (outing_id, restaurant_id),
    FOREIGN KEY (outing_id) REFERENCES outings(id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

-- votes table
CREATE TABLE IF NOT EXISTS votes (
    id uuid PRIMARY KEY,
    participant_id uuid NOT NULL,
    plan_item_id uuid NOT NULL,
    liked BOOLEAN NOT NULL,
    is_tiebreak BOOLEAN NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT votes_one_per_round_unique UNIQUE (participant_id, plan_item_id, is_tiebreak),
    FOREIGN KEY (participant_id) REFERENCES participants(id),
    FOREIGN KEY (plan_item_id) REFERENCES plan_items(id)
);

-- otp_codes table
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_otp_codes_phone ON otp_codes (phone);
