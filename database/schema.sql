-- users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER,
    name VARCHAR(255) NOT NULL,
    phone_number INTEGER,
    push_token TEXT,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (id, phone_number)
);

-- groups table
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER,
    name VARCHAR(255) NOT NULL,
    organizer_id INTEGER,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (organizer_id, id),
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- group_members table
CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER,
    user_id INTEGER,
    joined_at TIMESTAMP NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

--outings table
CREATE TABLE IF NOT EXISTS outings (
    id INTEGER,
    group_id INTEGER,
    organizer_id INTEGER,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL,
    invite_code VARCHAR NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    district VARCHAR(255) NOT NULL,
    tiebreak_ends_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (id, group_id),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- participants table
CREATE TABLE IF NOT EXISTS participants (
    id INTEGER,
    outing_id INTEGER,
    user_id INTEGER,
    guest_name VARCHAR(255) CHECK (user_id IS NULL),
    attendance VARCHAR(255) NOT NULL,
    preferences_done BOOLEAN NOT NULL,
    PRIMARY KEY (id, outing_id),
    FOREIGN KEY (outing_id) REFERENCES outings(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- preferences table
CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER,
    user_id INTEGER,
    participant_id INTEGER,
    liked_cuisines TEXT,
    allergies TEXT,
    budget_min INTEGER,
    budget_max INTEGER,
    max_distance_km INTEGER,
    seating_needs TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (participant_id) REFERENCES participants(id)
);

-- restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    brand_id INTEGER,
    cuisine TEXT NOT NULL,
    district TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    spend_low INTEGER NOT NULL,
    spend_high INTEGER NOT NULL,
    price_tier SMALLINT NOT NULL,
    rating TINYINT,
    rating_count INTEGER,
    quality_score NUMERIC,
    group_fit INTEGER,
    -- meal_fit_breakfast SMALLINT,
    -- meal_fit_late_night SMALLINT,
    -- opening_hours
    summary TEXT,
    maps_url TEXT NOT NULL,
    PRIMARY KEY (id)
);

-- plan_items table
CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER,
    outing_id INTEGER,
    restaurant_id INTEGER,
    rank INTEGER NOT NULL,
    match_score INTEGER NOT NULL,
    reason TEXT NOT NULL,
    is_winner BOOLEAN NOT NULL,
    PRIMARY KEY (id, outing_id, restaurant_id),
    FOREIGN KEY (outing_id) REFERENCES outings(id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

-- votes table
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER,
    participant_id INTEGER,
    plan_item_id INTEGER,
    liked BOOLEAN NOT NULL,
    is_tiebreak BOOLEAN NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (id, participant_id, plan_item_id),
    FOREIGN KEY (participant_id) REFERENCES participants(id),
    FOREIGN KEY (plan_item_id) REFERENCES plan_items(id)
);
