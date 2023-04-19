function b64decode(s) // string to bytes
{
    return Uint8Array.from(atob(s),
                           c => c.charCodeAt(0))
}

function concat(a, b) // assumes arrays of the same type
{
    var c = new (a.constructor)(a.length + b.length)
    c.set(a, 0)
    c.set(b, a.length)
    return c
}

function bin2hex(b) // byte array
{
  let t = new Uint8Array(b)

  return Array.from(t, e =>
         ('0' + e.toString(16)).slice(-2)).join('')
}

async function handler(msg)
{
  const nSize = 8 // nonce size
  const enc = new TextEncoder()

  const putc = enc.encode(msg.data.p_utc)
  const psig = b64decode(msg.data.p_sig)
  const vsay = enc.encode(msg.data.v_say)

  // nonce construction per vote-simulator.py :
  const rand = crypto.getRandomValues(new Uint8Array(nSize))
  const noff = putc.length + psig.length + vsay.length // nonce offset

  var   vote = concat(putc, concat(psig, concat(vsay, rand)))
  const vlen = vote.length;

  (new DataView(vote.buffer, noff, nSize)).setUint32(0, msg.data.start)

  var record = 0
  let pown, i, j

  var yuck_base = ''
  for (i = 0; i < noff; i++) yuck_base += String.fromCharCode(vote[i])

  for ( ;; )
  {
    var yuck = yuck_base
    for (i = noff; i < vlen; i++) yuck += String.fromCharCode(vote[i])

    var md = forge.md.sha256.create()
    md.update(yuck)

    var hash = Uint8Array.from(md.digest().data, c => c.charCodeAt(0))

    pown = 0
    
    for (i = 0; i < hash.length && hash[i] == 0; i++) pown += 8
    
    if (i < hash.length) for (j = 1; hash[i] << j < 256; j++) pown += 1

    if (record < pown)
    {
      record = pown

      if (pown > msg.data.recor) postMessage({ pown:  pown,

                          nonce: bin2hex(vote.slice(noff)), })
    }

    for (i = vlen; i >= noff; ) if (++vote[--i] < 256) break
  }
}

window = self
importScripts("/forge.min.js")

addEventListener("message", handler)
