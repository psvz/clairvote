## Power voting: transparent, secure, verifiable
This is an implementation of a voting system that relies on Proof-of-Work by user devices. It has **absolutely _positively_ nothing to do with blockchain** (in case you were assuming). Polling stations are still part of this design to tackle coercion, although going fully electronic is possible.

Main points of value:
- Reduced opportunity for tampering incl. by state actors and organizers
- Available off the shelf equipment for polling stations
- Near-real-time transparency and audit 

[systemDesign.pdf](https://github.com/psvz/clairvote/blob/main/systemDesign.pdf) **documents architecture and building blocks.**  

[https://clairvote.org/demo.html](https://clairvote.org/demo.html) represents a demo polling station.  
[https://clairvote.org/go.html](https://clairvote.org/go.html) is a voting app (in-browser/installable).  
[https://clairvote.org/check.html](https://clairvote.org/check.html) provides results and some analysis.  

Demo campaign is named `Solar` and themed after planets. You can download its raw data:  

[https://clairvote.org/solar-vote.log](https://clairvote.org/solar-vote.log) list of votes.  
[https://clairvote.org/solar-auth.log](https://clairvote.org/solar-auth.log) list of voters.  

#### Python
You can try and do `source bin/activate` inside cloned folder to rely on `venv` virtual environment, although it is not very stable, and you will likely end up installing a few packages (I have put the links in comments to relevant imports):  

[vote-simulator.py](https://github.com/psvz/clairvote/blob/main/vote-simulator.py) combines a voter and a polling station, casts a random vote.  
[mandates.py](https://github.com/psvz/clairvote/blob/main/mandates.py) prints voting authorizations (mandates) in form of QR, base32, and hex.  

#### [Crockford's Base32 codec](https://www.crockford.com/base32.html)
JavaScript implementation as functions defined [here](https://github.com/psvz/clairvote/blob/main/frontend/dyn.js).
