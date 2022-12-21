# -*- coding: utf-8 -*-
"""
ISC License

Copyright 2022 Vitaly Zuevsky <vx at claw dot ac>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
"""
import qrcode                       # https://pypi.org/project/qrcode/
import secrets
import krock32                      # https://pypi.org/project/krock32/
from nacl.signing import SigningKey # https://pypi.org/project/PyNaCl/
from base64       import b64encode
from PIL          import ImageFont, ImageDraw, Image
                                    # https://pypi.org/project/Pillow/

ttf = 'Consolas.ttf' # I, l, and 1
fontsize = 40
spacing = 30
canvasw = 1525
canvash = 766

auth_skey = SigningKey(bytes.fromhex(
    'e3d752f82e3d7364f6d253ecd5ac6592dcceee54e8f928c4022594e8ce769cd1'))

auth_id = secrets.token_bytes(24)
auth_sig = auth_skey.sign(auth_id).signature
auth_pkey = auth_skey.verify_key.encode()

mandate = b64encode(auth_sig).decode()[:22]

qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=10,
    border=4,
)

token = auth_pkey + auth_sig + auth_id

qr.add_data(token)
img = qr.make_image(fill_color="black", back_color="white")

font = ImageFont.truetype(ttf, fontsize)
linw = font.getbbox(mandate)[2]
linh = font.getbbox(mandate)[3]

can = Image.new('RGB', (canvasw, canvash), (255, 255, 255))

ImageDraw.Draw(can).text(((img.size[0] - linw) / 2, img.size[1] + linh / 2),  
                         mandate, font=font, fill=(0, 0, 0))

can.paste(img)

punch = ''
for i in range(12):
    
    enc = krock32.Encoder(checksum=True)
    enc.update(token[:10])
    r = enc.finalize()
    
    punch += f'{i+1:>2}:  {r[:4]}  {r[4:8]}  {r[8:12]}  {r[12:16]}  {r[16:]}\n' 
    token = token[10:]

ImageDraw.Draw(can).multiline_text((1.2 * img.size[0], 40), punch,
                                   font=font, spacing=spacing, fill=(0,0,0))

enc = krock32.Encoder(); enc.update(auth_sig[-1:] + auth_id)
base32id = enc.finalize()

can.save('auth/' + base32id + '.png')

token = (auth_pkey + auth_sig + auth_id).hex().upper()
with open('auth/~list', 'a') as f: f.write(f'{base32id}  {mandate}\n')

print('token-\n' + token)
can.show()
# QR app for the token: https://apps.apple.com/us/app/qrefine/id1210054176