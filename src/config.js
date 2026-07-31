/* Every tunable number in the game. Nothing here imports anything, so this
   file is safe to read top to bottom when you want to know how the tower
   behaves without reading any logic. */

export const BAYS      = 16;

export const MAX_FLOOR = 60;

export const CORE      = [7,8,6,9,5,10,4,11,3,12];

export const DOOR_MIN  = 2.4, DOOR_PER = 0.5;

export const WALK_SPD  = 1.6;

export const GIVE_UP   = 480;

export const DAY_START = 6*3600, DAY_END = 23*3600;

export const LOBBY='lobby';

export const TEN={
  shops :{name:'Shops',       col:'#D9A441', pop:12, cost: 6500, rent:1300, star:1, eat:true},
  office:{name:'Offices',     col:'#6E93B8', pop:28, cost:10000, rent:2600, star:1},
  apt   :{name:'Apartments',  col:'#C08457', pop:18, cost:11000, rent:2000, star:2},
  food  :{name:'Restaurants', col:'#C8663F', pop:14, cost:13000, rent:2600, star:3, eat:true},
  hotel :{name:'Hotel',       col:'#8B7BB8', pop:22, cost:14000, rent:2900, star:3},
  sky   :{name:'Penthouses',  col:'#5E9E8E', pop:10, cost:30000, rent:6200, star:5},

  /* ---- amenities: one of each per tower ----
     These pay for themselves through everyone ELSE'S rent, and they buy a bit
     of tolerance for a slow lift. But every one of them is also a destination,
     so the thing that raises your income also puts more people in the lobby. */
  foodcourt:{name:'Food court', col:'#C8663F', pop:22, cost: 38000, rent:2600, star:2,
    amenity:true, eat:true, sat:1, bonus:{rent:0.08, scope:'all'},
    blurb:'+8% rent everywhere · the whole tower comes here at lunch'},
  gym:{name:'Gym & spa', col:'#4E9E86', pop:16, cost: 46000, rent:2400, star:3,
    amenity:true, visit:'evening', sat:2, bonus:{rent:0.10, scope:'homes'},
    blurb:'+10% rent on homes · residents drop in most evenings'},
  conf:{name:'Conference centre', col:'#7A6FB0', pop:18, cost: 54000, rent:3000, star:3,
    amenity:true, visit:'morning', sat:1, bonus:{rent:0.10, scope:'offices'},
    blurb:'+10% office rent · visitors arrive mid-morning'},
  garden:{name:'Sky garden', col:'#6FA860', pop:8, cost: 62000, rent:2200, star:4,
    amenity:true, sat:3, bonus:{rent:0.14, scope:'near'},
    blurb:'+14% rent within five floors · and they forgive a slow lift'},
  deck:{name:'Observation deck', col:'#D9A441', pop:12, cost: 92000, rent:5200, star:5,
    amenity:true, topOnly:true, sat:1, bonus:{rent:0.12, scope:'all'},
    blurb:'must crown the tower · +12% rent everywhere'}
};

export const AMENITY_KEYS = Object.keys(TEN).filter(k=>TEN[k].amenity);

export const LOBBY_COL='#A9AFB6';

export const SHAFT_BASE=5000, SHAFT_PER=1500;

export const UPG={
  motor:{ name:'Motor', unit:'fl/s', lv:[
    {v:1.15,cost:0,     label:'Geared'},
    {v:1.60,cost: 9000, star:1, label:'Gearless'},
    {v:2.10,cost:21000, star:2, label:'High-speed'},
    {v:2.65,cost:40000, star:4, label:'Ultra'}]},
  /* Cabin covers how many fit AND how fast they get in. A separate door track
     measured as worthless: on a tall tower, door time is small against travel
     time, and shrinking the dwell only made the car pull away before people
     had walked to it. Three tracks that all matter beat four with a dud. */
  cabin:{ name:'Cabin', unit:'people', lv:[
    {v:12,per:0.52,cost:0,       label:'Standard'},
    {v:17,per:0.38,cost:11000, star:1, label:'Wide'},
    {v:23,per:0.28,cost:25000, star:3, label:'Heavy-duty'},
    {v:32,per:0.20,cost:47000, star:4, label:'Double-deck'}]},
  control:{ name:'Controller', unit:'', lv:[
    {v:0,cost:0,        label:'Collective'},
    {v:1,cost:17000, star:3, label:'Group control'},
    {v:2,cost:36000, star:4, label:'Destination dispatch'}]}
};

export const UPG_KEYS=['motor','cabin','control'];

export const CONN={
  stair:{name:'Stairs',    cost: 4000, maint: 6, star:1, up:17, down:12, penalty:11},
  esc  :{name:'Escalator', cost:24000, maint:48, star:2, up:11, down:11, penalty:1.6}
};

export const CONN_BAYS=[2,3];                       // a run criss-crosses, as they really do

export const STAR_REQ=[null,null,
  {pop: 120, let:4,               sat:50},                       // ★2
  {pop: 350, let:9,  lifts:2, amenities:1, sat:56},               // ★3
  {pop: 750, floors:20, lifts:3, amenities:2, sat:60},            // ★4
  {pop:1300, floors:32, lifts:4, amenities:3, sat:64}             // ★5
];

export const MAINT_PER_FLOOR=85;

/* Money with teeth. Cash used to go negative with no consequence at all — a
   test bot reached -$122,000 and carried on building. An overdraft costs real
   interest, and living in one for too long ends the run. */
export const OVERDRAFT_RATE = 0.03;     // per day, on the balance owed
export const OVERDRAFT_LIMIT = -250000; // below this you are finished
export const DEBT_GRACE_DAYS = 5;       // days overdrawn before the bank calls it in

export const OUTSIDE=-1;

export const SKY=[
  [0 ,'#141C2C','#1E2A40'],[5.2,'#243049','#4A4560'],[6.4,'#5B5470','#C08464'],
  [7.6,'#8FA6C4','#D9C4A8'],[10,'#A9C4DE','#D7E4EE'],[15,'#A2BFDC','#D2E1EC'],
  [17.4,'#8B9FC0','#E0B183'],[18.8,'#5C5F82','#D08258'],[20.2,'#2C3350','#4C4462'],
  [22,'#161E30','#232C42'],[24,'#141C2C','#1E2A40']
];

