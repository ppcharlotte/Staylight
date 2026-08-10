type PriorityPattern = {
  label: string;
  pattern: RegExp;
};

const priorityPatterns: PriorityPattern[] = [
  { label: "Value for money", pattern: /value for money|budget|性价比|预算/i },
  { label: "Quiet sleep", pattern: /noise|quiet|silent|light sleeper|安静|噪音|睡眠/i },
  { label: "Late-night safety", pattern: /safety|safe|late arrival|安全|夜间/i },
  { label: "Transit access", pattern: /commute|transit|station|metro|train|地铁|交通/i },
  { label: "Avoid nightlife streets", pattern: /party|nightlife|club|派对|夜店/i },
  {
    label: "Avoid hostels",
    pattern: /(?:no|not|avoid|never|without|don'?t want|do not want|don'?t accept|do not accept|refuse)\s+(?:a\s+)?(?:youth\s+)?hostels?|(?:will not|would not|won'?t|wouldn'?t)\s+stay\s+in\s+(?:a\s+)?(?:youth\s+)?hostel|hostels?\s+(?:are|is)\s+(?:a\s+)?deal.?breaker|不(?:接受|要|住).*?(?:hostel|青旅|青年旅舍)/i
  },
  { label: "Room size", pattern: /room size|tiny|small room|spacious|房间|空间/i },
  { label: "Cleanliness", pattern: /cleanliness|cleaness|cleaniness|clean room|dirty|unclean|hygiene|spotless|干净|卫生|脏/i },
  { label: "Reliable Wi-Fi", pattern: /wi-?fi|internet|网络/i },
  { label: "Work desk", pattern: /desk|workspace|办公|书桌/i },
  { label: "Private bathroom", pattern: /private bathroom|private toilet|en-?suite|own bathroom|独立卫生间|私人浴室|独立卫浴/i },
  { label: "Bathtub", pattern: /bathtub|bath tub|浴缸/i },
  { label: "Step-free access", pattern: /step-free|wheelchair|accessible|无障碍/i },
  { label: "Fitness facilities", pattern: /gym|fitness|健身/i },
  { label: "Breakfast", pattern: /breakfast|早餐/i },
  { label: "Laundry", pattern: /laundry|washing machine|洗衣/i },
  { label: "Balcony", pattern: /balcony|terrace|阳台|露台/i },
  { label: "Central location", pattern: /city cent(?:er|re)|downtown|central location|市中心/i }
];

export function extractRequirementPriorities(value: string): string[] {
  return priorityPatterns.filter(({ pattern }) => pattern.test(value)).map(({ label }) => label);
}

function normalizeCompletionAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[,，.!?。！？;；]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isExplicitInterviewFinish(value: string): boolean {
  const normalized = normalizeCompletionAnswer(value);
  const exactAnswers = new Set([
    "that's all",
    "that is all",
    "this is all",
    "it is all",
    "all good",
    "done",
    "finished",
    "没有更多",
    "没有更多问题",
    "没有更多问题了",
    "没有其他",
    "没有其他了",
    "没有其他要求",
    "没有其他要求了",
    "没有其他问题",
    "没有其他问题了",
    "我没有更多问题了",
    "没问题了",
    "就这些",
    "暂时没有"
  ]);

  return exactAnswers.has(normalized)
    || /^(?:no )?(?:that|this|it) (?:would be|is) all$/.test(normalized);
}

export function isNoMoreAnswer(value: string): boolean {
  const normalized = normalizeCompletionAnswer(value);
  return new Set(["no", "nope", "no more", "nothing else", "nothing more", "no thanks", "没有", "没有了", "没了"])
    .has(normalized) || isExplicitInterviewFinish(value);
}
