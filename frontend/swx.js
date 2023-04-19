addEventListener("fetch", (e) => {})
addEventListener("message", (m) => {

  if (m.data == "q")  { postMessage("hello")
                        close()
                      }
})
