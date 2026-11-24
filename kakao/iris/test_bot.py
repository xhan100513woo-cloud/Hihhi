import trade_cooldown_bot as B

H, W = 3600, B.WARNING
B.reset()
assert B.check_message("r", "u", "안녕하세요", 0) is None
assert B.check_message("r", "u", "안녕하세요", 1) is None
assert B.check_message("r", "u", "리자몽 ㄱㄹ 구해요", 0) is None
assert B.check_message("r", "u", "리자몽  ㄱㄹ\n구해요!", 1800) == W
assert B.check_message("r", "u", "리자몽 ㄱㄹ 구해요", 1800 + H - 1) == W
assert B.check_message("r", "u", "리자몽 ㄱㄹ 구해요", 1800 + 2 * H) is None
assert B.check_message("r", "other", "리자몽 ㄱㄹ 구해요", 1800 + 2 * H + 1) is None
assert B.check_message("r2", "u", "리자몽 ㄱㄹ 구해요", 1800 + 2 * H + 1) is None
for k in B.KEYWORDS:
    B.reset()
    assert B.check_message("r", "u", "피카츄 " + k, 0) is None, k
    assert B.check_message("r", "u", "피카츄 " + k, H - 1) == W, k

# Iris 웹훅 형식
B.reset()
sent = []
ev = {"msg": "ㅍㅍ 뮤츠", "room": "거래방", "sender": "철수",
      "json": {"chat_id": "123", "user_id": "9", "message": "ㅍㅍ 뮤츠"}}
assert B.handle_event(ev, lambda c, t: sent.append((c, t))) is False
assert B.handle_event(ev, lambda c, t: sent.append((c, t))) is True
assert sent == [("123", W)]
print("iris trade-cooldown: all tests passed")
