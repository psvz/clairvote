var nonce, record = 5 // number of leading zero bits achieved
var updateAfter = 18 // show works end-by estimate
var wthreshold = 25 // minimal work proof

var response
var campaign
var powstart

var p_utc
var p_sig
var voter
var mysay
var procn
var wtest

function b64encode(b) // Uint8Array
{
  return btoa(String.fromCharCode.apply(null, b))
}

function crock32enc(b, v) // https://www.crockford.com/base32.html
{
  const a = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U"
  let c, p, q, r, s = ""

  for (c = 0; c < b.length * 8; c += 5)
  {
    q = c / 8 | 0 // quotient
    r = c % 8     // remainder

    p = b[q] & (255 >>> r)
    if (r > 3)
    {
      p <<= (r - 3)
      if (++q < b.length) p |= b[q] >>> (11 - r)
    }
    else p >>>= (3 - r)

    s += a.at(p)
  }
  if (v) // append checksum
  {
    for (q = 0, c = 0; q < b.length; q++)
    {
      c = ((c << 8) + b[q]) % 37
    }
    s += a.at(c)
  }
  return s
}

function crock32dec(s, a) // with tail check char
{
  const z = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U"
  let v, w, x, p = 0

  a = a || new Uint8Array()
  s = s.toUpperCase().replace(/[^0-Z*~$=]/g, "")

  s = s.replace(/[O]/g, "0")
  s = s.replace(/[IL]/g, "1")

  let b = new Uint8Array(1)
  while ( (v = z.indexOf(s.slice(0, 1))) >= 0 && (s = s.slice(1)))
  {
    if (v >>> 5) return false
    if (p < 3)
    {
      b[0] |= v << (3 - p)
      p += 5
    }
    else
    {
      p -= 3
      b[0] |= v >>> p

      x = x ? (x << 8) + b[0] : b[0]
      x %= 37

      w = new Uint8Array(a.length + 1)
      w.set(a, 0)
      w.set(b, a.length)
      a = w

      b = new Uint8Array(1)
      b[0] |= v << (8 - p)
    }
  }
  if (x != v) return false

  return a
}

function avalidate(v, f)
{
  let c = v.value.toUpperCase().replace(/[-: \t]/g, "")

  if (c.length == 17 && crock32dec(c))
  {
    v.value = c.slice(0, 4) + '  ' + c.slice(4, 8) + '  ' +
      c.slice(8, 12) + '  ' + c.slice(12, 16) + '  ' + c.slice(16)
    f.textContent = "<ok"
  }
  else
  {
    if (c.length) f.textContent = "error"
    else f.textContent = ""
  }
}

function advanceme(e)
{
  if (e.key == "Enter")
    window[e.target.id.replace(/\d+$/, (m) => {return ++m})].focus()
}

function pastparse(e, i)
{
  let lines = e.clipboardData.getData("text").split('\n')

  e.preventDefault()

  for (const [c, ln] of lines.entries())
  {
    if (i > 12) break
    if (ln) window["author" + i].value = ln
    if (c < lines.length - 1) window["author" + ++i].focus()
  }
}

async function showfinish(insec)
{
  let by = new Date(Date.now() + insec)

  let ddd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][by.getDay()]

  let d, dd = (d = by.getDate()) < 10 ? '0' + d : d

  let mmm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][by.getMonth()]

  let h, hh = (h = by.getHours()) < 10 ? '0' + h : h
  let m, mm = (m = by.getMinutes()) < 10 ? '0' + m : m
  let s, ss = (s = by.getSeconds()) < 10 ? '0' + s : s

  author13.innerHTML = "<h2>Expected completion @ " + ddd + ' ' + dd +
                        ' ' + mmm + ' ' + hh + ':' + mm + ':' + ss + "</h2>"

  window["sf_timer"] = setTimeout(showfinish, insec, insec)
}

async function getMandate()
{
  let adata, vsets
  let auth_id, auth_sig, auth_pkey

  if (window["author1"].value)
    for (let i = 1; i < 13; i++)
      adata = crock32dec(window["author" + i].value, adata)

  if (adata?.length != 120)
  {
    if (canvas.height == 0 &&
        confirm("Scanning QR code now?\nCancel to enter manually"))
    {
      let scrpt = document.createElement("script")
      await new Promise((e) => {

        scrpt.onload = e
        scrpt.src = "/jsQR.js"
        document.head.appendChild(scrpt)
      })

      var video = document.createElement("video")
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }})

        .then((stream) => {

          video.srcObject = stream
          video.setAttribute("playsinline", true)

          video.play()
          vsets = stream.getVideoTracks()[0].getSettings()
        })
        .catch((error) => {

          alert(`${error.name}: ${error.message}`)
          return
        })

      const art = canvas.getContext("2d", { willReadFrequently: true })

      canvas.height = 300
      canvas.scrollIntoView()

      let imageData, qr

      function drawg(ctx, begin, end)
      {
        ctx.beginPath()
        ctx.moveTo(begin.x, begin.y)
        ctx.lineTo(end.x, end.y)
        ctx.lineWidth = 4
        ctx.strokeStyle = "green"
        ctx.stroke()
      }

      while (1)
      {
        if (video.readyState == video.HAVE_ENOUGH_DATA)
        {
          canvas.width = canvas.height * vsets.width / vsets.height

          art.drawImage(video, 0, 0, canvas.width, canvas.height)
          imageData = art.getImageData(0, 0, canvas.width, canvas.height)

          qr = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert", })

          if (qr && qr.binaryData.length == 120)
          {
            drawg(art, qr.location.topLeftCorner, qr.location.topRightCorner)
            drawg(art, qr.location.topRightCorner, qr.location.bottomRightCorner)
            drawg(art, qr.location.bottomRightCorner, qr.location.bottomLeftCorner)
            drawg(art, qr.location.bottomLeftCorner, qr.location.topLeftCorner)

            adata = qr.binaryData
            break
          }
        }
        if (document.getElementById("canvas") == null) return

        await new Promise(a => setTimeout(a, 100))
      }
    }
    else return
  }

  auth_pkey = b64encode(adata.slice(0, 32))
  auth_sig = b64encode(adata.slice(32, 32 + 64))
  auth_id = b64encode(adata.slice(32 + 64)) // 24 bytes

  for (let i = 0; i < procn; i++) window["worker" + i].terminate()
  //console.log(`PoW score: ${record}, Nonce: ${nonce}`)

  response = await fetch("https://" + campaign + ".clairvote.org/" + nonce,
                         { headers:
                          { "auth-pkey": auth_pkey,
                            "auth-sig" : auth_sig,
                            "auth-id"  : auth_id,
                
                            "p-utc"    : p_utc,
                            "p-sig"    : p_sig,
                
                            "say"      : mysay,
                            "voter"    : voter,
                          }})
  if (!response.ok)
  {
    alert(`Error code:  ${response.status}\nSee member of staff...`)
    return
  }

  main.style.fontFamily = "monospace"
  main.innerHTML = "\n    <h2>Receipt " + campaign.toUpperCase() + ' ' +

                   (new Date()).toISOString().split('T')[0] + "</h2>"

  for (const [key, value] of response.headers.entries())
  {
    if (key.toLowerCase().startsWith("rece"))
    {
      main.innerHTML += "\n    <p> " + value + "</p>"
    }
  }
  var receipt = new Blob(['<html lang="en">\n',
                          structuredClone(document.body.innerHTML)],
                                                  {type: "text/html"})

  let anc = document.createElement("a")

  anc.textContent = "Save Receipt"
  anc.href = URL.createObjectURL(receipt)
  anc.download = "vote-" + campaign.toUpperCase() +
                 (new Date()).toISOString().split('T')[0] + ".html"

  if (confirm("Save Receipt - you can check\n" +
              "your vote is as casted later")) anc.click()

  main.appendChild(anc)
}

async function powgain(msg)
{
  if (msg.data.pown > record)
  {
    record = msg.data.pown
    nonce = msg.data.nonce

    author13.title = `PoW score: ${record}`

    if (record >= wthreshold)
    {
      clearTimeout(window["sf_timer"])

      author13.innerHTML = "<h2>Ready when you are...</h2>"
      author13.onclick = getMandate
      author13.title = `Click me, PoW score: ${record}`

      console.log(`Took ${(Date.now() - powstart) / 1000}s`)
    }
    else if (record > updateAfter)
    {
      let insec

      clearTimeout(window["sf_timer"])

      insec = (Date.now() - powstart) * 2**(wthreshold - record)
      if (insec < 120 * 1000) insec = 120 * 1000
      showfinish(insec)
    }
  }
}

async function working()
{
  let sum = 0, num = 0
  totp.value.trim().substring(1).replace(/\d/g, n => { sum += +n; num += 1 })

  let check = totp.value.trim().at(0)?.toUpperCase()
  check = check == 'A' ? 10 : check

  if (!check || num != 6 || check != sum % 11)
  {
    alert("Bad booth code entered, please enter next green code")
    totp.value = ""
    totp.focus()
    return
  }
  check = totp.value.trim().substring(1).replace(/\D/g, "")

  let say = document.querySelector('input[name="choice"]:checked')
  if (!say)
  {
    alert("Please, pick your say")
    return
  }
  mysay = say.value

  totp.value = "wait..."

  while (1)
  {
    try
    {
      response = await fetch("https://" + campaign + ".clairvote.org/stamp",
                             { headers: { "totp": check }})
      if (response.ok) break
    }
    catch {}
  }
  p_utc = response.headers.get("P-UTC")
  p_sig = response.headers.get("P-SIG")

  let v = crock32enc(crypto.getRandomValues(new Uint8Array(17)))
  voter = v.slice(0, 5) + ':' + v.slice(5, 9) + '-' + v.slice(9, 13) + '-' +
          v.slice(13, 17) + '-' + v.slice(17, 21) + ':' + v.slice(21, 26)

  main.style.fontFamily = "consolas"
  main.innerHTML = `
    <p>Creating corpus of cryptographic work to fortify your voting record. Make sure this device stays awake...
    <p>Meanwhile, you can enter your voting authorization. The button at the bottom
    will give you status updates. When it gets ready you could click it any time
    to cast your vote.
    <p><b>If you allow more time after the button is ready your vote
    will get stronger protection from meddling.</b>
    <p><b>If your device has a camera, you will be able to scan your voting authorization after
    clicking the button - leave following fields blank.</b>
    <p>Now, please see the station staff to obtian your voting authorization:
    <br><br>
    `
  for (let i = 1; i < 13; i++) main.innerHTML += `

    <div style="margin-bottom: .5em;">
      <label style="text-align: right;width: 3em;display: inline-block;">${i}:</label>
      <input id="author${i}" size="25" style="font-size: 1.5em;font-family: monospace;text-align: right;"
        spellcheck="false" onfocusout="avalidate(this, valid${i})" onkeydown="advanceme(event)" onpaste="pastparse(event, ${i})">
      <i id="valid${i}"></i>
    </div>
  `
  //valid1.textContent = "error"

  // id is after last input for advanceme() to work :
  main.innerHTML += `<button id="author13"
      style="width: 80%;margin: 4em auto;display: flex;justify-content: center;">
    </button>
    <canvas id="canvas" height=0
      style="margin: 0 auto 2em;display: flex;justify-content: center;">
    </canvas>
    `
  author13.innerHTML = "<h2>Starting up...</h2>"

  scrollTo(0, 0)

  powstart = Date.now() // ms

  //return
  procn = navigator.hardwareConcurrency || 4
  if (procn > 4) procn--

  for (let i = 0; i < procn; i++)
  {
    window["worker" + i] = new Worker("/pow.js")
    window["worker" + i].onmessage = powgain
    window["worker" + i].postMessage(
    {
      p_utc: p_utc,
      p_sig: p_sig,
      recor: record,
      v_say: voter + mysay,
      start: 0x100000000 * i / procn | 0,
    })
  }

  try
  {
    await navigator.wakeLock.request("screen")

    document.addEventListener("visibilitychange", async () =>
    {
      if (document.visibilityState == "visible")
      {
        await navigator.wakeLock.request("screen")
      }
    })
  } catch {}
}

async function dynamic()
{
  document.body.innerHTML = `
    <div id="main" style="position:absolute;opacity:0.6;width:98%;"></div>
  `
  campaign = location.search.replace(/[?&=]/g, "")
  if (campaign)
  {
    let p = document.createElement("p")
    p.style = "font-family: consolas;"
    p.innerHTML = "Please<p>- proceed to a booth or voting area and click your say below" +
                  "<p>- look up a booth code and wait until it changes from red to green" +
                  "<p>- enter the code under the ballot sheet and click <b>Cast</b> while the code is displayed" +
                  "<p>You will not be able to see or change your vote after correct booth code is entered..."

    main.appendChild(p)
    main.appendChild(document.createElement("br"))

    while (1)
    {
      try
      {
        response = await fetch("https://" + campaign + ".clairvote.org/list")
        if (response.ok) break
      }
      catch {}
      //await new Promise(a => setTimeout(a, 500))
    }

    for (const [key, value] of response.headers.entries())
    {
      if (!key.toLowerCase().startsWith("say")) continue

      let opt = document.createElement("div")
      opt.innerHTML = `
                      <p><b>
                      <input type="radio" name="choice" onclick="totp.focus()" id="${key}" value="${value}">
                      <label for=${key}>${value}</label>
                      `
      opt.style = "font-family: consolas;"

      main.appendChild(opt)
    }

    let foo = document.createElement("div")
    foo.innerHTML = `
                    <br>
                    <form action="javascript:working()">
                      <label for="totp">Booth code (7 characters): </label>
                      <input type="text" id="totp" size="9" autocomplete="off"
                        style="text-align: center;font-size: 1.5em;font-weight: bold;">
                      <input type="submit" title="Click me" style="font-size: 1.5em;" value="Cast">
                    </form>
                    `
    foo.style = "font-family: consolas;"
    main.appendChild(foo)
  }
  else
  {
    let wkr = new Worker("/swx.js")
    wkr.onmessage = (m) => { wtest = m.data }
    wkr.postMessage("q")

    response = await fetch("/select.json")
    if (!response.ok) throw new Error(`fetch select.json: ${response.status}`)
    let text = await response.text()

    text = text.replace(/[\b\f\r\n\t]/g, "")
    text = text.replace(/,}/g, "}")

    let h2 = document.createElement("h2")
    h2.innerHTML = "Please, click your campaign"
    h2.style = "display: flex;justify-content: center;"
    main.appendChild(h2)

    for (const [key, value] of Object.entries(JSON.parse(text)))
    {
      if (key == "label") continue

      let btn = document.createElement("button")
      btn.innerHTML = "<h2>" + value + "</h2>"
      btn.onclick = () => {

        if (wtest == "hello") location.href += "?" + key
        else
        {
          alert("OS/Browser do no support\nWorkers - cannot proceed!")
          return
        }
      }
      btn.title = "Click me"
      btn.style = "width: 80%;margin: 2rem auto;display: flex;justify-content: center;"
      main.appendChild(btn)
    }
  }
}
