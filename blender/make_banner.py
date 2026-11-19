# 7·8·9층 상담실 북쪽 벽 현수막 이미지 (사진을 보고 다시 그림)
from PIL import Image, ImageDraw, ImageFont
W, H = 2400, 560
img = Image.new("RGB", (W, H), "#f7f7f5")
d = ImageDraw.Draw(img)
F = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
big = ImageFont.truetype(F, 128, index=1)  # KR
small = ImageFont.truetype(F, 52, index=1)
tiny = ImageFont.truetype(F, 22, index=1)
BLACK, RED = "#1a1a1a", "#9b1c24"

def line(parts, y):
    widths = [d.textlength(t, font=big) for t, _ in parts]
    x = (W - sum(widths)) / 2
    for (t, c), w in zip(parts, widths):
        d.text((x, y), t, font=big, fill=c)
        x += w

line([("전 산업군 ", BLACK), ("1위", RED), (" KSQI ‘고객감동콜센터’", BLACK)], 30)
line([("통신업계 ", BLACK), ("1위", RED), (" KS-CQI ‘최우수기업’ 달성", BLACK)], 200)

y = 425
# KSQI · KMAC
x = 640
d.rectangle([x, y, x + 62, y + 62], fill="#2c5aa0")
d.text((x + 31, y + 31), "Q", font=ImageFont.truetype(F, 50, index=1), fill="white", anchor="mm")
d.text((x + 72, y + 2), "KSQI", font=tiny, fill="#2c5aa0")
d.text((x + 150, y + 31), "KMAC", font=ImageFont.truetype(F, 60, index=1), fill="#2a2a2a", anchor="lm")
# LG유플러스
x = 1230
d.ellipse([x, y, x + 62, y + 62], fill="#a50034")
d.text((x + 31, y + 31), "LG", font=ImageFont.truetype(F, 24, index=1), fill="white", anchor="mm")
d.text((x + 76, y + 31), "LG유플러스", font=small, fill="#555", anchor="lm")
# KSA 한국표준협회
d.text((1640, y + 31), "KSA 한국표준협회", font=small, fill="#6b5a4a", anchor="lm")
d.rectangle([0, 0, W - 1, H - 1], outline="#dddddd", width=4)
img.save("tex/ksqi_banner.jpg", quality=88)
print(img.size)
