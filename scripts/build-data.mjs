// 원본 수집 데이터(raw)를 앱에서 쓰는 정규화된 /data/*.json 으로 변환하는 스크립트
// 사용법: node scripts/build-data.mjs <weapons_raw.json> <operators_raw.json>
import fs from 'node:fs';

const [, , wPath, oPath] = process.argv;
const weaponsRaw = JSON.parse(fs.readFileSync(wPath, 'utf8'));
const operatorsRaw = JSON.parse(fs.readFileSync(oPath, 'utf8'));

const stats = {
  base: [['str','힘'],['agi','민첩'],['int','지능'],['wil','의지'],['main','주요 능력치']],
  extra: [['atk','공격력'],['hp','생명력'],['phys','물리 피해'],['heat','열기 피해'],['elec','전기 피해'],['cryo','냉기 피해'],['nature','자연 피해'],['crit','치명타 확률'],['originium','오리지늄 아츠 강도'],['ult','궁극기 충전 효율'],['arts','아츠 피해'],['heal','치유 효율']],
  skill: [['assault','강공'],['suppress','억제'],['pursuit','추격'],['crush','분쇄'],['technique','기예'],['burst','방출'],['flow','흐름'],['efficiency','효율'],['morale','사기'],['pain','고통'],['medic','의료'],['fracture','골절'],['brutal','잔혹'],['dark','어둠']],
};
const byLabel = new Map();
for (const [cat, list] of Object.entries(stats)) for (const [id, label] of list) byLabel.set(label.replace(/\s/g, ''), { id, cat });
const lookup = (label) => {
  let k = label.replace(/ 증가$/, '').replace(/^최대 /, '').replace(/\s/g, '');
  if (k === '아츠강도') k = '오리지늄아츠강도';
  if (k === '주요능력치') k = '주요능력치';
  const hit = byLabel.get(k);
  if (!hit) throw new Error('알 수 없는 기질 속성: ' + label);
  return hit;
};

const weapons = weaponsRaw.map((w) => {
  const essence = { base: null, extra: null, skill: null };
  for (const r of w.rec) { const { id, cat } = lookup(r); essence[cat] = id; }
  const out = { id: w.id, name: w.name.trim(), rarity: w.rarity, type: w.type, essence, trait: w.trait, cover: w.cover };
  // 데이터 검증 메모: 3성 '지미니 12'는 추천 기질(공격력)과 무기 스킬(강공)이 위키상 불일치
  if (w.id === '40') out.note = 'TODO: 위키 추천 기질(공격력)과 무기 스킬(강공 · 무장 정비) 불일치 — 확인 필요';
  return out;
}).sort((a, b) => b.rarity - a.rarity || Number(a.id) - Number(b.id));

const weaponIds = new Set(weapons.map((w) => w.id));
const operators = operatorsRaw.map((o) => {
  for (const id of [...o.rec.skill, ...o.rec.attr]) if (!weaponIds.has(id)) throw new Error(`${o.name}: 무기 ${id} 없음`);
  return { id: o.id, name: o.name, rarity: o.rarity, weaponType: o.weaponType, element: o.element, faction: o.faction, mainStat: o.mainStat, subStat: o.subStat, recommendedWeapons: { skill: o.rec.skill, attribute: o.rec.attr }, cover: o.cover };
}).sort((a, b) => b.rarity - a.rarity || Number(b.id) - Number(a.id));

// 지역별 기질 풀(data/essence-regions.json)은 인게임 캡처 기준 수기 관리 — 이 스크립트가 덮어쓰지 않음

const meta = (source, extra = {}) => ({ source, collectedAt: '2026-10-02', ...extra });
const write = (f, obj) => fs.writeFileSync(new URL('../data/' + f, import.meta.url), JSON.stringify(obj, null, 2) + '\n');

write('essence-stats.json', {
  _meta: meta('https://wiki.skport.com/endfield (무기 상세 > 추천 주입 기질)'),
  base: stats.base.map(([id, label]) => ({ id, label })),
  extra: stats.extra.map(([id, label]) => ({ id, label })),
  skill: stats.skill.map(([id, label]) => ({ id, label })),
});
write('weapons.json', { _meta: meta('https://wiki.skport.com/endfield/catalog?mainTypeId=1&subTypeId=2'), weapons });
write('operators.json', { _meta: meta('https://wiki.skport.com/endfield/catalog?mainTypeId=1&subTypeId=1 (무기 추천 > 게임 내 추천)'), operators });
console.log('weapons', weapons.length, 'operators', operators.length);
