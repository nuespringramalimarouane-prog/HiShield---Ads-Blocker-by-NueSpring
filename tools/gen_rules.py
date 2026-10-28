import json, os
first_party = [
  "||youtube.com/api/stats/ads",
  "||youtube.com/pagead/",
  "||youtube.com/ptracking",
  "||youtube.com/get_midroll_",
  "||youtube.com/youtubei/v1/player/ad_break",
  "||youtube.com/api/stats/atr_ad",
]
third_party = ["||doubleclick.net^", "||googlesyndication.com^", "||googleadservices.com^", "||2mdn.net^"]
types = ["xmlhttprequest","script","image","sub_frame","ping","media","other"]
rules, i = [], 1
for f in first_party:
    rules.append({"id": i, "priority": 1, "action": {"type": "block"}, "condition": {"urlFilter": f, "resourceTypes": types}}); i += 1
for f in third_party:
    rules.append({"id": i, "priority": 1, "action": {"type": "block"},
      "condition": {"urlFilter": f, "resourceTypes": types, "initiatorDomains": ["youtube.com","youtube-nocookie.com"]}}); i += 1
out = os.path.join(os.path.dirname(__file__), "..", "extension", "rules", "youtube_rules.json")
json.dump(rules, open(out, "w"), indent=2)
print("wrote", len(rules), "rules")
