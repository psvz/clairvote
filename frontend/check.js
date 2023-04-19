var wthreshold = 25 // minimal work proof
var bucketing = 86400 // 60s in prod amchart
var amchart

function hex2bin(even) // assumes even number of hex chars
{
    return Uint8Array.from(
           even.match(/.{2}/g).map((b) => parseInt(b, 16)))
}

function b64decode(s) // assumes ASCII
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

async function parse(e)
{
  if (e.files[0])
  {
    var timap = {}
    var votes = {}
    var total = 0
    var twork = 0

    progress.textContent = "Please, wait..."
    fileDate.textContent = new Date(e.files[0].lastModified)

    const size = e.files[0].size
    const flow = e.files[0].stream().getReader()

    const dec = new TextDecoder()

    let done = 0
    let tail = new Uint8Array()

    while (1) // chunk decomposition :
    {
      response = await flow.read()
      if (response.done) break

      let fin, ptr = 0
      let chunk = concat(tail, response.value)

      while (1) // line decomposition :
      {
        fin = chunk.indexOf(10, ptr) + 1 // using \n only
        if (fin > 0)
        {
          let line = chunk.slice(ptr, fin)
          line[line.length - 1] = 32 // space

          let field = []
          let d, f, p = 0

          while (p < line.length) // field decomposition :
          {
            if (line[p] == 34) { d = 34; p ++ } // quote mark
            else d = 32 // delimiter is a space

            f = line.indexOf(d, p)
            field.push(line.slice(p, f))

            p = d == 34 ? f + 2 : f + 1
          }
          // Fields: 0 - utc; 1 - p_sig; 2 - voter; 3 - nonce; 4 - say

          // bucketing :
          let key = (dec.decode(field[0]) / bucketing | 0) * bucketing +
                                                  Math.round(bucketing / 2)
          timap[key] = (timap[key] || 0) + 1
          // Object.keys(timap).sort()

          key = dec.decode(field[4])
          votes[key] = (votes[key] || 0) + 1

          total++

          key = concat(field[0],
                  concat(b64decode(dec.decode(field[1])),
                    concat(field[2],
                      concat(field[4], hex2bin(dec.decode(field[3]))
                ))))
          const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', key))

          let pown = 0
          for (var i = 0; i < hash.length && hash[i] == 0; i++)
              pown += 8
    
          for (let j = 1; hash[i] << j < 256; j++) pown += 1

          if (pown < wthreshold) throw new Error(`PoW fails by ${dec.decode(field[2])}`)
          twork += 1 << pown

          if (voterId.value && dec.decode(field[2]) == voterId.value)
            var e2ev = `

            <p>Voter ID from your receipt is on file: <b>"${dec.decode(field[4])}"</b></p>
          `

          ptr = fin
        }
        else
        {
          tail = chunk.slice(ptr)
          break
        }
      }
      done += chunk.length
      progress.textContent = `Parsed: ${done * 100 / size | 0}%`
    }
    main.innerHTML = (e2ev ? e2ev : "") + `
      <p>Total number of votes: <b>${total}</b></p>

      <p>Total work:<b>
      ${twork.toString().match(/.{1,3}(?=(.{3})*$)/g).join(',')}
      </b>sha-256 cycles</p>

      <p>Median PoW score:<b>
      ${Math.round(Math.log2(twork) - Math.log2(total))}</b>
      digest leading zero bits</p>

      <h2><u>Table</u></h2>
    `

    for (const [k, v] of Object.entries(votes).sort((a, b) => b[1] - a[1]))
      main.innerHTML += `
        <p><b><span
          style="display: inline-block;width: ${total.toString().length + 1}em;">
        ${v + ' '}</span><span
          style="display: inline-block;width: 7em;">
        ${(v * 100 / total).toFixed(2) + '%'}</span></b>${k}</p>
      `

    // https://www.amcharts.com/demos-v4/area-with-time-based-data-v4/
    amchartdiv.style = "width: 95%;height: 500px;"
    am4core.useTheme(am4themes_animated)

    if (amchart) amchart.dispose()
    amchart = am4core.create("amchartdiv", am4charts.XYChart)

    let integral = 0, chartData = []
    for (const [k, v] of Object.entries(timap).sort((a, b) => a[0] - b[0]))
      chartData.push(
      {
        date: new Date(k * 1000),
        votes: integral += v
      })
    amchart.data = chartData
    //chart.numberFormatter.numberFormat = "#"

    let dateAxis = amchart.xAxes.push(new am4charts.DateAxis())
    dateAxis.baseInterval =
    {
      "timeUnit": "minute",
      "count": 1
    }
    dateAxis.tooltipDateFormat = "d MMM HH:mm"

    let valueAxis = amchart.yAxes.push(new am4charts.ValueAxis())
    valueAxis.tooltip.disabled = true
    valueAxis.title.text = "Votes"
    valueAxis.renderer.labels.template.adapter.add("text", function(text, target)
    {
      return text?.match(/\.[1-9]/) ? "" : text
    })

    let series = amchart.series.push(new am4charts.LineSeries())
    series.dataFields.dateX = "date"
    series.dataFields.valueY = "votes"
    series.tooltipText = "Votes: [bold]{valueY}[/]"
    series.fillOpacity = 0.3

    amchart.cursor = new am4charts.XYCursor()
    amchart.cursor.lineY.opacity = 0
    amchart.scrollbarX = new am4charts.XYChartScrollbar()
    amchart.scrollbarX.series.push(series)
  }
  else
  {
    fileDate.textContent = ""
    progress.textContent = ""
    main.innerHTML = ""
    amchart.dispose()
  }
}

async function check()
{
  campaign = location.search.replace(/[?&=]/g, "")
  if (campaign)
  {
    document.body.innerHTML = `
      <div style="position:absolute;opacity:0.6;width:98%;font-family: consolas;margin: auto 20px;">
      <p>We publish. You can download votes file and process it locally
      to see results (server-side handling can be added in future)</p>
      <label for="voterId">Voter ID from your receipt (optional):</label>
      <input type="text" id="voterId" size="34" spellcheck="false" autocomplete="off"
        style="text-align: center;font-weight: bold;" onchange=
        "localStorage.setItem('vid', this.value);if(this.value.length==31){logInput.value=''}else this.value=''">
      <br><br>
      <a href="/${campaign}-vote.log" onclick="logInput.value=''"
        download>Download Current Votes File</a>
      <br><br>
      <input type="file" id="logInput" onchange="parse(this)">
      <span id="fileDate"></span>
      <br>
      <p id="progress"></p>
      <br>
      <div id="main"></div>
      <br>
      <div id="amchartdiv"></div>
      </div>
    `
    voterId.value = localStorage.getItem('vid')
  }
  else
  {
    document.body.innerHTML = '<div id="main" style="position:absolute;opacity:0.6;width:98%;">'

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
      btn.onclick = () => { location.href += "?" + key }

      btn.title = "Click me"
      btn.style = "width: 80%;margin: 2rem auto;display: flex;justify-content: center;"
      main.appendChild(btn)
    }
  }
}
