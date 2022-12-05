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

Nonce construction
------------------

uint32_t on 64-bit OS are processed more efficient than uint64_t on 32-bit OS,
hence let the nonce be an integer number of uint32_t blocks.

Most significant uint32_t                        big-endian in uint32_t blocks
<---------------------------------------------------------------------------<-
 ____________    ____________     ____________
|  uint32_t |   |  uint32_t |    |  uint32_t |
^^^^^^^^^^^^    ^^^^^^^^^^^^     ^^^^^^^^^^^^      ...
split by #of    |_____________________________________|
  threads           each thread starts with random

All threads run same random time within [x .. 2x] interval, because the longer
the minimum x => the more people buffered => the larger the exit time-spread
we want to even out queuing at staffed service points (intuition).

END: winner among all threads is chosen by the greaest number of leading zero
bits in a big-endian byte-by-byte representation of the respective hashes.

"""

import re
import time
import hmac
import ctypes
import krock32 # https://pypi.org/project/krock32/
import secrets
import hashlib
from requests import get
from fixedint import UInt32 # https://pypi.org/project/fixedint/
from nacl.signing import SigningKey # https://pypi.org/project/PyNaCl/
from base64 import b64encode, b64decode
from multiprocessing import Process, Value, Array, cpu_count

'''
# private keys to sign mandates :
q = SigningKey.generate()
print(q.encode().hex() + ' <skey')
print(q.verify_key.encode().hex())
'''
auth_skey = SigningKey(bytes.fromhex(
    'e3d752f82e3d7364f6d253ecd5ac6592dcceee54e8f928c4022594e8ce769cd1'))
# skey.encode().hex()

totp_secret = bytes.fromhex(
    'afa8d5f00f5816e179ba20d2b066b0689c7e02da0b6b3af4d917b25eef16333f')

endPoint = 'https://solar.clairvote.org'
threads = cpu_count()
mintime = 90    # seconds
noncesz = 2     # number of uint32_t blocks in the nonce
wthresh = 25    # PoW threshold configured at clairvote.org

def worker(start, interval,\
           p_utc, p_sig, voter, say,\
           vNonce, vScore, cycnt, vMinwork):

    nonce = []
    for i in range(noncesz):
        
        if i == 0: nonce.append(UInt32(start))
        else: nonce.append(UInt32.from_bytes(secrets.token_bytes(4)))
    
    tock = interval + time.time()
    
    while True:
        
        m = hashlib.sha256()
        
        m.update(p_utc)
        m.update(p_sig)
        m.update(voter)
        m.update(say)
        
        for i in nonce: m.update(i.to_bytes(byteorder='big'))
        
        h = m.digest()
        pown = 0
        
        for i in h:
            if i == 0: pown += 8
            else:
                while i << 1 < 0x100:
                    
                    pown += 1
                    i = i << 1
                    
                break
        
        if pown > vScore.value:
            
            vScore.value = pown
            for i in range(noncesz):
                
                vNonce[i] = ctypes.c_uint32(nonce[i])
                
            if pown >= wthresh: vMinwork.value = 1
                
        for i in range(len(nonce)-1, -1, -1):
            
            nonce[i] += 1
            if nonce[i] != 0: break
        
        cycnt.value += 1
        
        # finish on time constraint and work constraint
        if time.time() > tock and vMinwork.value: break


# main :
if __name__ == '__main__':
    
    r = 0
    while True:
        
        # -- TOTP algo --
        
        token = hmac.HMAC(totp_secret, str(int(time.time() / 30)).encode(),
            
                                     digestmod=hashlib.sha256).hexdigest()
        
        s = re.search('(\d)\D*(\d)\D*(\d)\D*(\d)\D*(\d)\D*(\d)\D*$', token)
        
        totp = ''
        for i in range(6,0,-1):
            
            try: totp += s.group(i)
            except: totp += str(i)

        # -- req --
        
        r = get(endPoint + '/stamp', headers={"totp": totp})
        print(f'\nRequested {r.request.url}, TOTP: {totp}')
        if r.status_code == 200: break
        print(f'Error {r.status_code}')
        time.sleep(1)

    p_utc = r.headers['p-utc']
    p_sig = r.headers['p-sig']
    
    while True:
        
        r = get(endPoint + '/list')
        print(f'\nRequested {r.request.url} - ballot options')
        if r.status_code == 200: break
        print(f'Error {r.status_code}')
        time.sleep(1)
        
    ballot = [v for k, v in r.headers.items() if k.lower().startswith('say')]
    
    isay = secrets.randbelow(len(ballot))
    print(f'\nReceived {len(ballot)} ballot options, voting "{ballot[isay]}"')
    
    auth_id = secrets.token_bytes(24)
    auth_sig = b64encode(auth_skey.sign(auth_id).signature)
    mandate = auth_sig.decode()[0:22] # 132 bits entropy
    
    e2ev = secrets.token_bytes(17) # need 130 bits in fact
    enc = krock32.Encoder(); enc.update(e2ev); a = enc.finalize()
    voter = f'{a[0:5]}:{a[5:9]}-{a[9:13]}-{a[13:17]}-{a[17:21]}:{a[21:26]}'
    
    headers = {
                "auth-pkey": b64encode(auth_skey.verify_key.encode()),
                "auth-sig" : auth_sig,
                "auth-id"  : b64encode(auth_id),
                
                "p-utc"    : p_utc.encode('ascii'),
                "p-sig"    : p_sig,
                
                "say"      : ballot[isay].encode(),
                "voter"    : voter,
              }
    
    nonce = []
    score = []
    cycnt = []
    process = []
    minwork = Value('L', 0, lock=False)
    
    interval = mintime + secrets.randbelow(mintime)
    print(f'off to work for {interval}s by {threads} CPUs, please wait..')
    
    for i in range(threads):
        
        nonce.append(Array(ctypes.c_uint32, noncesz, lock=False))
        score.append(Value('L', 0, lock=False))
        cycnt.append(Value('L', 0, lock=False))
        
        process.append(Process(target=worker, args=\
                               (0x100000000 * i / threads, interval,
                                headers['p-utc'], b64decode(p_sig),
                                headers['voter'].encode(), headers['say'],
                                nonce[i], score[i], cycnt[i], minwork)))
        process[i].start()
    
    winscore = 0
    cycntsum = 0
    
    for i in range(threads):
        
        process[i].join()
        cycntsum += cycnt[i].value
        
        if score[i].value > winscore:
            
            uri = ''
            winscore = score[i].value
            
            for n in nonce[i]:
                for k in n.to_bytes(4, byteorder='big'): uri += f'{k:02x}'
    
    print(f'\nPoW score achieved: {winscore} with {cycntsum} cycles')
    r = get(endPoint + '/' + uri, headers=headers)
    print(f'\nRequested {r.request.url}')
    
    print(f'Voter: {headers["voter"]}\nMandate: {mandate}')
    if r.status_code == 200:
        
        print("\nsuccess!\n")
        for k, v in r.headers.items():
            if k.lower().startswith('rece'): print(f'{k:10s}{v:70s}')
        
    else:
        print(f'\nError code: {r.status_code}')
