// Other people's work that the guide pages credit and link to: published gun tier lists, short
// quotes from public threads, and evanthebouncy's drills video. Collected 2026-11-14 from YouTube,
// r/survivio (through the Arctic Shift archive) and the surviv.io Fandom wiki. Each entry links to
// its source; quotes are kept short and verbatim, and nothing is copied beyond that.

// Published tier lists and rankings, most viewed first. `top` is the author's top pick, top three
// or top tier as far as it could be read from the video, post or blog; null where it couldn't be.
export const TIER_LISTS = [
  { title: 'WHAT\'S THE BEST SNIPER?', author: 'GAMERIO', where: 'YouTube', date: '2021-08-17', url: 'https://www.youtube.com/watch?v=DS_POcxKIUc', reach: '160k views', top: ['AWM-S'], note: 'snipers only' },
  { title: 'RANKING EVERY GUN: WORST TO BEST (Surviv.io)', author: 'Septus', where: 'YouTube', date: '2018-05-13', url: 'https://www.youtube.com/watch?v=KfjShbnoCkI', reach: '158k views', top: ['Saiga-12', 'M249', 'Desert Eagle'] },
  { title: 'RANKING EVERY GUN: WORST TO BEST — UPDATED', author: 'Septus', where: 'YouTube', date: '2018-09-21', url: 'https://www.youtube.com/watch?v=cUi4h5rp2Z4', reach: '58k views', top: ['AWM-S', 'M249', 'Saiga-12'] },
  { title: 'Ranking all surviv io weapons! (November 2020)', author: 'Necropro Gaming', where: 'YouTube', date: '2020-12-01', url: 'https://www.youtube.com/watch?v=zEYAWk92oJU', reach: '34k views', top: null },
  { title: 'TOP 5 MOST POPULAR GUN COMBOS', author: 'Septus', where: 'YouTube', date: '2018-06-10', url: 'https://www.youtube.com/watch?v=WA9X2ZQwlTU', reach: '19k views', top: ['MP220 plus an assault rifle or SMG'], note: 'loadouts' },
  { title: 'I Ranked *EVERY* Surviv.io Weapon (Tier List)', author: 'iHASYOU', where: 'YouTube', date: '2021-12-28', url: 'https://www.youtube.com/watch?v=6yQ5DxVM_6A', reach: '13k views', top: ['AWM-S', 'PKP', 'SV-98', 'USAS-12'] },
  { title: 'Ranking Every Gun | SURVIV.IO', author: 'Siper', where: 'YouTube', date: '2019-06-16', url: 'https://www.youtube.com/watch?v=vf7u75WaC1E', reach: '12k views', top: null, note: 'a joke ranking' },
  { title: 'Shotguns Ranked', author: 'not a bot', where: 'YouTube', date: '2020-03-08', url: 'https://www.youtube.com/watch?v=lfVq9D1VOKg', reach: '3.3k views', top: ['Saiga-12'], note: 'shotguns only' },
  { title: 'my tierlist', author: 'u/aliemreyesil', where: 'r/survivio', date: '2020-08-29', url: 'https://www.reddit.com/r/survivio/comments/iiqnxz/', reach: '85 points, 195 comments', top: null },
  { title: 'My surviv tier list', author: 'u/Garklein', where: 'r/survivio', date: '2020-07-05', url: 'https://www.reddit.com/r/survivio/comments/hlng4u/', reach: '13 points, 155 comments', top: null },
  { title: 'Updated worst to best gun list', author: 'u/GrandShowerofBullets', where: 'r/survivio', date: '2018-09-05', url: 'https://www.reddit.com/r/survivio/comments/9d8iyg/', reach: '11 points, 49 comments', top: ['AWM-S', 'M249', 'Saiga-12'] },
  { title: 'Probably Top 10 Best/Worst Weapons', author: 'u/hiwassupyo', where: 'r/survivio', date: '2019-08-31', url: 'https://www.reddit.com/r/survivio/comments/cxz94k/', reach: '4 points, 9 comments', top: ['AWM-S', 'PKP', 'SV-98'] },
  { title: 'my tierlist for all surviv guns', author: 'u/xilenator', where: 'r/survivio', date: '2024-12-09', url: 'https://www.reddit.com/r/survivio/comments/1habnnr/', reach: '17 points, 34 comments', top: ['SV-98'] },
  { title: 'Every surviv.io gun ranked! (by classes)', author: 'u/JARV1A', where: 'r/survivio', date: '2020-03-29', url: 'https://www.reddit.com/r/survivio/comments/frbn0x/', reach: '21 points, 12 comments', top: ['P30L (best pistol)'], note: 'ranked within each class' },
  { title: 'Gun tierlist', author: 'u/tennis-637', where: 'r/survivio', date: '2025-06-12', url: 'https://www.reddit.com/r/survivio/comments/1l9yeu6/', reach: '12 points, 18 comments', top: ['dual OTs-38'] },
  { title: 'Hot take the USAS-12 is the best gun', author: 'u/Deep_Map3132', where: 'r/survivio', date: '2026-10-24', url: 'https://www.reddit.com/r/survivio/comments/1xeepdt/', reach: '12 points, 20 comments', top: ['USAS-12'] },
  { title: 'Opinions on the best gun, AWM-S?', author: 'u/Relative-Dog-4030', where: 'r/survivio', date: '2026-05-31', url: 'https://www.reddit.com/r/survivio/comments/1tt18l1/', reach: '15 points, 15 comments', top: null, note: 'a discussion: AWM-S or USAS-12' },
  { title: 'Weapon Rankings', author: 'TheSURVIVR', where: 'surviv.io Fandom wiki', date: '2019-12-03', url: 'https://survivio.fandom.com/wiki/User_blog:TheSURVIVR/Weapon_Rankings', reach: '53 guns scored out of 100', top: ['AWM-S', 'M249', 'SV-98'] },
];

// Short, verbatim comments on which guns are best, each linked to where it was posted.
export const QUOTES = [
  { text: 'AWM - has potential to one shot or two shot.', author: 'u/Only_2EZ', date: '2019-03-11', url: 'https://www.reddit.com/r/survivio/comments/azlmf4/_/ei8qk8h/' },
  { text: 'SV-98, it has high speed, common ammo, insane damage.', author: 'u/thewirereal', date: '2019-03-11', url: 'https://www.reddit.com/r/survivio/comments/azlmf4/_/ei8wcx8/' },
  { text: 'No one should be ranking M870 above Spas.', author: 'u/Kobiesan', date: '2020-07-06', url: 'https://www.reddit.com/r/survivio/comments/hlng4u/_/fx4bet2/' },
  { text: 'The M870 is a bit broken (it can one tap a person with complete lvl 3 protection).', author: 'u/Plylyfe', date: '2020-07-07', url: 'https://www.reddit.com/r/survivio/comments/hlng4u/_/fx7oh59/' },
  { text: 'M870 is WAAAAAAAAAAAAAAAAAAAAAAAAAY too high. MP220 is far better.', author: 'u/OwlMuted885', date: '2025-06-16', url: 'https://www.reddit.com/r/survivio/comments/1l94h7w/_/my0rgq4/' },
  { text: 'usas-12 is my personal best gun. so fun to use and better than awm-s in numerous situations.', author: 'u/bobthememer123-', date: '2026-05-31', url: 'https://www.reddit.com/r/survivio/comments/1tt18l1/_/ooz9fng/' },
  { text: 'if you know how to play,awm-s is the best gun', author: 'u/Fresh-Difference-108', date: '2026-05-31', url: 'https://www.reddit.com/r/survivio/comments/1tt18l1/_/ooz6t99/' },
  { text: 'It\'s always just awm awm awm', author: 'u/Deep_Map3132', date: '2026-10-25', url: 'https://www.reddit.com/r/survivio/comments/1xeepdt/_/19rlvx7qwxdj8/' },
  { text: 'I\'ve done better with just my fists in survev than an M9.', author: 'u/OwlMuted885', date: '2024-12-09', url: 'https://www.reddit.com/r/survivio/comments/1habnnr/_/m17zokl/' },
  { text: 'The real best gun wasn\'t the USAS or AWM... But the friends we made along the way', author: 'u/Vitini9', date: '2020-07-15', url: 'https://www.reddit.com/r/survivio/comments/hrts0w/_/fy6hzxx/' },
];

// "5 surviv drills to help you improve" by evanthebouncy (Evan Pu), posted 2019-07-15.
// Times are where each part starts; quotes are from the video's captions.
export const EVAN = {
  id: 'lSGtX67upUQ',
  title: '5 surviv drills to help you improve',
  channel: 'Evan Pu', channelUrl: 'https://www.youtube.com/@evanpu1993',
  reddit: 'https://www.reddit.com/r/survivio/comments/cdsl7h/',
  date: '2019-07-15', length: '1:01:39',
};
