from app.services.auth.otp import CODE_LENGTH, code_matches, generate_code, hash_code

SECRET = "test-secret"
PHONE = "0551234567"


def test_code_is_six_digits():
    for _ in range(200):
        code = generate_code()
        assert len(code) == CODE_LENGTH
        assert code.isdigit()


def test_codes_are_not_repeated():
    codes = {generate_code() for _ in range(200)}
    assert len(codes) > 190


def test_hash_does_not_contain_the_code():
    assert "123456" not in hash_code(PHONE, "123456", SECRET)


def test_correct_code_matches():
    stored = hash_code(PHONE, "123456", SECRET)
    assert code_matches(PHONE, "123456", stored, SECRET)


def test_wrong_code_does_not_match():
    stored = hash_code(PHONE, "123456", SECRET)
    assert not code_matches(PHONE, "654321", stored, SECRET)


def test_same_code_for_another_phone_does_not_match():
    stored = hash_code(PHONE, "123456", SECRET)
    assert not code_matches("0559999999", "123456", stored, SECRET)


def test_different_secret_does_not_match():
    stored = hash_code(PHONE, "123456", SECRET)
    assert not code_matches(PHONE, "123456", stored, "another-secret")