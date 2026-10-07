# RollerCoaster Tycoon — research notes (2026-10-07)

## 1. History
- RCT1: designed/programmed by Chris Sawyer (Scotland, near Dunblane), ~2 years, working title "White Knuckle".
  ~99% x86 assembly (MS Macro Assembler 6.11c), ~1% C for Windows/DirectX glue (MSVC 5, DirectX 5 SDK).
  Art: Simon Foster (pre-rendered 3D sprites: LightWave 5.6, Raydream, TrueSpace, Poser, Photoshop, DeBabelizer...).
  Music: Allister Brimble. Publisher: Hasbro Interactive under MicroProse label. Released 22 Mar 1999 (NA), 12 Apr 1999 (EU).
  Grew out of engine work for a Transport Tycoon sequel (TT 1994, also assembly).
- Expansions: Corkscrew Follies (NA) / Added Attractions (EU) Nov 1999, 30 scenarios; Loopy Landscapes Sep 2000, 30 scenarios (includes CF).
  Total 81 scenarios. Mega Park unlocked after all 21 originals ("Have fun", $50k loan). Gold (2002), Deluxe (2003, one disc).
  Fort Anachronism and Alton Towers were downloadable scenarios. Xbox port 2003 by Frontier (mixed reviews).
- Sales: best-selling PC game of 1999 in US (719,535 units), 1.25M in 2000, ~954k in 2001 (2nd to The Sims both years); >4M by July 2002.
  Sawyer reportedly earned ~$30M royalties. Series >9M units by 2004 (MCV). 1999 Strategy Game of the Year (CGSP).
- RCT2: 15 Oct 2002 (NA), Infogrames. Same engine (isometric), RCT1 parks compatible. Adds: scenario editor, coaster designer (save/reuse),
  walls/roofs pieces, build at varying heights above/below ground, bulldozer, user scenery, Six Flags licensed parks (Magic Mountain, Great Adventure, Over Texas + Walibi Holland/Belgium),
  all scenarios unlocked at launch in 5 tabs (Beginner, Challenging, Expert, Real, Other). Reviews 74/100 (same engine criticised, no sandbox).
  Expansions by Frontier: Wacky Worlds (May 2003, 17 scenarios, world cultures) and Time Twister (Nov 2003, 14 scenarios, eras). Triple Thrill Pack Oct 2004.
  US sales 940k ($21.6M) by Aug 2006. "Mr. Bones' Wild Ride" meme (2012, 30,696 ft, 4 in-game years, "The ride never ends").
- RCT3 (2004, Frontier, Atari): full 3D, CoasterCam, peeps with families, fireworks, Soaked! (2005, water parks) & Wild! (2005, zoo). Platinum = all. Complete Edition 2020 (Frontier Foundry), consoles 2025. Atari bought RCT3 rights from Frontier Mar 2024 ($7M).
- Later: RCT 3D (3DS 2012), RCT4 Mobile (2014), RCT World (2016, mostly negative), RCT Classic (Dec 2016 iOS/Android, 2017 PC; = RCT1+RCT2 features, by Origin8 with Sawyer),
  RCT Touch (2017 F2P, 6.5M downloads in 3 months), RCT Adventures (Switch Nov/Dec 2018, Nvizzio), Adventures Deluxe (Nov 2023), RCT Wonderworks (announced Gamescom Aug 2026, Springloaded, isometric/tabletop look, early access winter 2026).
- Publishers: Hasbro (1999–2001) → Infogrames (2001–2003) → Atari (2003–). Sawyer owns the IP, Atari holds the master license.
- OpenRCT2: started 2 Apr 2014 by Ted John (IntelOrca); decompiled RCT2.EXE routine-by-routine to C, then C++. 250+ contributors.
  Adds: widescreen, fast-forward, multiplayer (TCP 11753), plugins (JS/Duktape, ES5, v0.3.0+), cheats, OpenGL, RCT1 import, .park save format (v0.4.0+), raised limits, better pathfinding.
  Needs original RCT2 assets. Title theme 2023 by Brimble.
- Chris Sawyer's philosophy: "creating great games comes mostly from experience rather than study"; "you need to understand what people enjoy"; organised, methodical, patient.

## 2. Core loop (what the player does)
Pick a scenario → objective (e.g., 250 guests + park rating ≥600 by end of Year 1) → build paths, rides, stalls, scenery → set prices → hire staff → research new rides
→ take loans/marketing → keep park rating up → win when objective hit on a day change; fail if deadline passes (and in RCT1 if park rating < 700 for a stretch... RCT2: "park rating too low" warning then failure).
Three ride ratings: Excitement / Intensity / Nausea. Guests have intensity preferences & nausea tolerance.

## 3. Ride ratings (from OpenRCT2 RideRatings.cpp — fixed point, 100 = 1.00)
Each ride type has base E/I/N + per-ride-type modifiers (length, speed, duration, G's, turns, drops, sheltered, scenery, proximity).
- Positive vertical G: E += G*0.08, I += G*0.8, N += G*0.26 (per G, fixed point)
- Negative vertical G: E += clamp(G,-2.5,0)*-0.24; I += (G-1)*-0.8; N += (G-1)*-0.22
- Lateral G: E += min(1.5, latG)*0.4; I += latG; N += latG*0.33
- Lateral penalty: latG > 2.8 → I +3.75, N +2.0; latG > 3.1 → I +12.25, N +6.0, E roughly halved and negated → ride ruined
- Turns: flat 3+ turns E 2.5/I 1.25/N 5.0 each; banked 3+ E 3.75; sloped turns up to caps.
- Inversions: E += min(inv,6)*26.67 (hundredths), I += inv*50, N += inv*21.67
- Drops: E += min(9,drops)*11.11, I += drops*14.17, N += drops*10
- Highest drop height: E += h*0.49, I += h*0.98, N += h*0.63 (per height unit)
- Helices: E ≈3.89 each (max 9), I ≈2.27 (max 11), N 20 each beyond 5
- Sheltered track: small E/N bonus; each sheltered section ≈11.82 E (max 11)
- Air time: E += min(air,200)/8, N += air/16
- Scenery: min(items within ±5 tiles of station, 47)*5 hundredths → E (max +2.35 excitement). Underground station = fixed 40.
- Proximity: water over track ≈0.67 each (max 60), track touching surface, passing near other tracks/paths, through tunnels, etc.
- Intensity penalty: for each threshold intensity crosses (10.00, 11.00, 12.00, 13.20, 14.50) excitement -= excitement/4 (five → ~24% left).
- Requirement penalties (per ride type): too short, too few drops, no negative G (no airtime), too slow, too few inversions, too few stations → divide E/I/N by factors.
- Ride value = (E*mE + I*mI + N*mN)/1024 (mults per type, e.g., alpine 50/30/10), × age factor (new +30, <13mo +10, <40mo ×1, then decays to 81/1024 by 200 months), −25% if another open ride of same type. Guests pay up to value (×2 if park has entrance fee? check).

## 4. Park rating (0–999)
Start 1150 (1050 on hard difficulty). Then:
- Guests: −150 at 0 guests up to ~+3 at 2000+ (count/13 term)
- Happiness: −500 + 2*min(happy*300/total, 250) → 0 when ≥83% of guests happy (>50% happiness)
- Lost guests (can't find exit): first 25 free, −7 each after, no floor
- Ride uptime: −200 at 0% average uptime → 0 at 100%
- Average excitement vs 3.68 and intensity vs 5.20 targets: up to −100
- Total excitement and total intensity each should exceed 80.00 summed over rides: up to −200
- Litter (not fresh): −4 each, max −600
- Casualties: drowning −25 each; crash with guests +200 to penalty (while <500); decays over time; max −1000
- Clamp 0..999. Rating drives guest arrival probability and awards.

## 5. Guests (peeps)
Stats: happiness, energy, hunger, thirst, toilet (bathroom), nausea, nausea tolerance (none/low/avg/high), intensity preference range (e.g., 2–5, 4–7, 5–8 ...), cash, time in park, items (balloon, umbrella, map, hat, photos, food/drink).
Thoughts list drives actions ("I want to go home", "I'm hungry", "Can't find the exit", "X is really good value", "too intense for me", "I feel sick"...).
Leave when: happiness low, out of money, visited long enough, tired. Vandalism when very unhappy & no security seen.
RCT2 AI: guests head to stalls when hungry/thirsty; double-wide paths no longer confuse them.
Walking: no U-turns mid path; decisions at junctions (random, slight bias straight on); with map → head to chosen ride; "no entry" signs steer off dead ends.
Ride choice: (1) walk toward queue if ride's intensity within preference and nausea within tolerance; (2) at the queue: price vs value, queue length, excitement, waited too long (>?); free transport rides taken regardless.
Guest generation: probability per tick depends on park rating, soft guest cap (RCT2: based on ride count/excitement), marketing, admission price vs value; "difficult guest generation" scenario flag.

## 6. Staff
- Handyman: sweep paths, empty bins, mow grass, water gardens ($35/mo RCT1, $50 RCT2)
- Mechanic: inspect (every 10/20/30/45/60 min or never) and fix breakdowns; rides degrade reliability with age
- Security guard: deters vandals in view
- Entertainer: costumes (tiger/panda/elephant in RCT1; more in RCT2), cheers queuers
- Patrol areas assignable per staff member.
Breakdown types: safety cut-out, restraints stuck closed, restraints stuck open, doors stuck closed/open, vehicle malfunction, brakes failure (can crash), control failure.

## 7. Economy
- Money: cash, loan (interest %/yr, max loan per scenario), company value = park value − loan. Park value = sum of ride values + ...
- Pay-per-ride vs pay-per-entry parks (RCT2 scenarios fix one; RCT1 allowed both; OpenRCT2 cheat allows both).
- Income: ride tickets, shop sales, admission; Expenses: construction, wages (every 8 days along with research & interest), ride running costs (every 16 days), marketing, research funding (none/min/normal/max).
- Research categories: transport rides, gentle rides, roller coasters, thrill rides, water rides, shops & stalls, scenery & theming.
- Marketing: free entry vouchers, free ride vouchers, half-price entry, free food/drink vouchers, park advertising, ride advertising; run 1–6 weeks; ad campaigns raise arrivals.
- Time: 40 ticks/s; 512 ticks per day (12.8 s); 32 days/month → ~6m50s a month; 8 months (Mar–Oct) per year → ~55 min/year. Scenario deadline Oct 31 of year N.
- Awards (monthly check): Most untidy, Most tidy, Best roller coasters, Best value, Most beautiful, Worst value, Safest, Best staff, Best food, Worst food, Best restrooms, Most disappointing, Best water rides, Best custom-designed rides, Most dazzling ride colours, Most confusing layout, Best gentle rides.

## 8. Scenario objectives (OpenRCT2 ObjectiveType)
None; Guests by date (+ park rating ≥ 600); Park value by date; Have fun; Build the best coaster (excitement X); 10 roller coasters (excitement ≥ X);
Guests and rating (no deadline, rating must stay ≥ 700); Monthly ride income; 10 coasters of length; Finish 5 pre-built coasters; Repay loan and park value; Monthly food income.
RCT1 originals (21): Forest Frontiers (250 guests, rating 600, end Y1), Dynamite Dunes, Leafy Lake, Diamond Heights, Evergreen Gardens, Bumbly Beach, Trinity Islands, Katie's Dreamland (Lightwater Valley), Pokey Park, White Water Park, Millennium Mines, Karts & Coasters, Mel's World, Mystic Mountain, Pacific Pyramids, Crumbly Woods, Paradise Pier, Lightning Peaks, Ivory Towers, Rainbow Valley, Thunder Rock, (Mega Park).
Corkscrew Follies examples: Whispering Cliffs ($17k value Y3), Three Monkeys Park (1400 guests), Canary Mines (1300), Barony Bridge (1200), Funtopia (1400), Haunted Harbour (1200), Fun Fortress (1300), Future World (1500), Gentle Glen (1200)...
Loopy Landscapes: Urban Jungle (1200), Terror Town (10 coasters ≥6.00), Megaworld Park (3500 guests, rating >700), Venus Ponds (1600 Y4), Micro Park ($10k Y3), Alton Towers/Heide-Park (2500 guests Y3), Blackpool Pleasure Beach ...

## 9. Files / tech
- Map: tiles with stacked elements (surface, path, track, small scenery, large scenery, wall, entrance, banner). RCT1 maps up to 128×128, RCT2 up to 256×256; heights in 8-unit steps... (RCT2 land height units; coaster max height ~ RCT2 limit).
- Formats: SV4/SC4/TD4 (RCT1), SV6/SC6/TD6 (RCT2, RLE-ish chunked, checksum), DAT objects (16-byte header: flags, 8-char name, checksum; type nibble 0–0x0A), g1.dat sprites; OpenRCT2 .park + JSON objects.
- SV6 object table: 721 slots (128 rides, 252 small scenery, 128 large, 128 walls, 32 banners, 16 paths, 15 path bits, 19 scenery groups, park entrance, water, scenario text). 255 ride slots.
- Isometric: 2:1 diamond tiles, sprite rotations ×4, pre-rendered; depth sort by tile order; 8-bit palette (256 colours) with remappable colour ranges for ride colours.

## 10. Exact mechanics from OpenRCT2 source (second pass)
### Guest creation (Guest::generate)
- mass 45–76; happiness = scenario initial (default 128) ±15; hunger/thirst = scenario initial (200 default) ±15; nausea 0, toilet 0; energy 65–128.
- intensity preference: base range 3..10 (upper 15 if high ≥7); park flags: prefer less intense → 0..4; prefer more intense → 9..15; both → 0..15.
- nausea tolerance from a 12-entry table: 1×none, 2×low, 3×average, 6×high (index = rand 0..7, +4 if "prefer more intense").
- cash = scenarioInitialCash (default 50.00) + one of {−100,0,100,200} (cents ×100), floored at 0.
- Spawn: each tick roll rand16 < probability. probability = 50 + clamp(rating−200, 0, 650) (50..700); ÷4 if guests > soft cap (sum of open rides' BonusValue, e.g. wooden coaster 105, giga 120, corkscrew 100); ÷4 more on "difficult guest generation" (cap base max 1000, long exciting rides ×2 extra); ÷4 if entrance fee > total ride value-for-money; ÷4 again if fee/2 > it; +25% per positive award, −25% per negative award. Marketing campaigns roll separately: free entry 400, free ride 300, half-price entry 200, free food 200, park ads 250, ride ads 200 (÷8 if price already tiny). ~1500 ≈ one guest per second. Hard sprite cap ~9600 in RCT2.
### Guest ride choice (shouldGoOnRide)
- Refuse: leaving park (except free transport); queue too full (last guest < 8 units away, or <13 with timeInQueue>10); same as previous ride; price > cash; recent crash unless happiness ≥225; raining unless ride ≥3/8 sheltered or umbrella (50%);
- Intensity window: minI = pref.min*100 − happiness; maxI = min(pref.max*100, 1000) + happiness; below → "want something more thrilling", above → "too intense for me".
- Nausea: maxN = {300,600,800,1000}[tolerance] + happiness; above → "too sickening"; also refuse nausea ≥1.40 rides if guest nausea > 160.
- Unrated rides: 90% ignore; else refuse if vertG > 5.0 or < −4.0 or latG > 4.0.
- Price: pays up to 2× ride value (value ÷4 if guest paid park entry). Over → "not worth it" (−16 happiness target); price ≤ value/2 → "good value".
- Nearest-ride search radius 10 tiles (all rides with a map); picks closest by Manhattan distance.
- Re-ride wants happiness ≥180, energy ≥100, nausea ≤160, hunger ≥30, thirst ≥20, toilet ≤170.
### Guest stats over time
- Per tick: energy → target (−2/+4), happiness & nausea → targets by 4. Every 128 ticks: hunger −15 (flag), toilet +50, happiness target drifts toward 127; −2 if energy ≤50, −1 if hunger or thirst <10, −1 if toilet ≥195; nausea target −2; vomit chance (nausea−128)/2 of 256 when nausea target ≥128.
- Thoughts: tired energy ≤70 & happiness <128; hungry ≤10 (no food); thirsty ≤25; toilet ≥160; running out of money cash ≤9.00; sick nausea ≥140, very sick ≥200 (→ first aid); lost −30 happiness target; queue: eats at 2000 ticks, "waiting ages" at 3500, leaves queue at 4300 if happiness ≤65 (3.3%).
- Food: consumption adds +7 hunger per tick-step (drink +7 thirst, food −3 thirst, +2 toilet). Eating/drinking refused if hunger >75 / thirst >75 or nausea ≥145. Sitting on bench: energy target +5 to 135, thirst −4, toilet +3, nausea target −6.
- On ride satisfaction −140..+105: queue ≥4500 ticks −35, ≥2250 −10, ≤750 +10; same type +10; intensity/nausea fit scores 70/50/35/20/10/−35/−50/−60; value satisfaction. Happiness target += satisfaction. Favourite ride when happiness & target ≥160.
- Nausea growth on ride: mult = clamp(256 − happinessTarget, 64, 200); gen = ride.nausea*mult/512; adj = gen*max(128,hunger)/128*2; change = adj >> tolerance(0..3).
- Leaving: stays if energy ≥55, happiness ≥45, cash ≥5.00; otherwise 5% per check to leave ("I want to go home"); also after 5×2048 ticks without picking a ride → leave. Lost countdown 254.
- Vandalism: happiness <48, energy ≥85, litter/disgust flags high, 5% roll, no security within 7 tiles (224 units) → smash bench, angry 16.
- Litter: 6.25% chance per drop check to drop wrapper (empty can, rubbish, burger box, cup); bins absorb 7/8 of items until full. Litter older than ~5 min counts in park rating (−4 each, max −600).
- Watching rides: excitement ≥4.70 or intensity ≥4.50 → guests stop to watch.
- Faces: happiness steps of 37 (7 faces); sick faces at nausea 140/170/200; tired at energy 46/70.
### Time
- Month = 65536 monthTicks, +4 per tick → 16384 ticks/month; days per month {31,30,31,30,31,31,30,31} (Mar..Oct), 8 months/year; week = 4096 ticks (4/month) → wages, research, interest, marketing; fortnight → ride upkeep; month → awards, expenditure shift, objective check. Day ≈ 528 ticks (≈13 s at 40 tps); month ≈ 6.8 min; year ≈ 55 min.
- Casualty penalty on rating decays 7/day (40 if no-money park).
### Finance
- Loan start 10,000, max 20,000, interest 10%/yr: weekly interest = loan*5*rate >> 14 (RCT1: loan/2400). Wages/week = monthly/4: handyman 50, mechanic 80, security 60, entertainer 55 per month. Research/month: none 0, min 100, normal 200, max 400 (progress 0/160/250/400 per 32 ticks; 3 stages of 65535 each → max funding ≈ 15.7k ticks ≈ 6.5 min per item at 40 tps).
- Park value = Σ ride value×10×(customersLast5min + BonusValue×4) + guests×7.00; company value = park value − loan + cash.
- Ride value (×10 = price scale): (E*mE + I*mI + N*mN)/1024 with type multipliers (wooden 52/33/8, giga ~?); age: <5mo +30, <13 +10, <40 ×1, <64 ×0.75, <88 ×9/16, <104 ×27/64, <120 ×81/256, <128 ×81/512, <200 ×81/1024, ≥200 ×9/16; −25% if a duplicate type is open. Guests pay up to 2× (value/10) in a pay-per-ride park, ÷4 if they paid entry.
- Shop items: cost/base value/default price e.g. balloon 0.30/1.40/0.90, drink 0.30/1.20/1.20 (hot 2.00), burger 0.50/1.90/1.50, chips 0.40/1.60/1.50, ice cream 0.40/1.00/0.90 (hot 1.50), candyfloss 0.30/0.90/0.80, umbrella 2.00/3.50/2.50 (cold 5.00), map 0.10/0.70/0.60, hot dog 0.50/1.70/1.00, coffee 0.30/1.10/1.20, photo 0.20/3.00, T-shirt 2.00/3.70/3.00, hat 0.90/2.70/1.50. Guests halve the "overpriced" gap at happiness ≥128 and again ≥180.
### Rides
- Wooden coaster RTD: base E 3.20 / I 2.60 / N 2.00; requirements: drop height ≥12, max speed ≥10 (0xA0000), negative G ≤ −0.10, length ≥ 0x1720000 (≈ 370 units), ≥2 drops else E/I/N ÷2 each; penalty lateral G; build cost 37.50/track piece 3.50; default price 20 (=2.00); upkeep 40 base; BonusValue 105; max height 41; modes continuous circuit / block sectioned / reverse-incline shuttle; breakdowns: safety cut-out, restraints stuck closed/open, vehicle malfunction, brakes failure; track groups include lift hill, banked turns, vertical loop, s-bend, helix, brakes, block brakes, on-ride photo, water splash, booster.
- Breakdown roll every 256 ticks: reliability −= unreliabilityFactor + agePenalty (age 1y /8, 2y /4, 3–4y /2, 5–7y ×1, 8y+ ×2); breakdown if rand(0..0x2FFFFF) ≤ 1 + 25000 − reliability (~0.8% at start). Weights: safety cut-out 25, restraints stuck closed 12/open 10, doors 13/10, vehicle malfunction 6, brakes failure 3 (20 when raining; never <16 months old or reliability >50%), control failure 3. Inspection every 2048 ticks check; intervals 10/20/30/45/60/120 min/never; inspection adds ((100 − rel%)/4)×rand(0..255) reliability. Downtime = min(total/2, 100) per 8192 ticks.
- Income per hour = customers/hour × (price − item cost); profit = income − upkeep×16; popularity every 25 samples; satisfaction averaged every 20.
- Ride types in RCT2 (103 ids): spiral, stand-up, suspended swinging, inverted, junior, miniature railway, monorail, mini suspended, boat hire, wooden wild mouse, steeplechase, car ride, launched freefall, bobsleigh, observation tower, looping, dinghy slide, mine train, chairlift, corkscrew, maze, spiral slide, go-karts, log flume, river rapids, dodgems, swinging ship, swinging inverter ship, food stall, drink stall, shop, merry-go-round, information kiosk, toilets, ferris wheel, motion simulator, 3D cinema, top spin, space rings, reverse freefall, lift, vertical drop, cash machine, twist, haunted house, first aid, circus, ghost train, twister, wooden, side-friction, steel wild mouse, multi-dimension, flying, virginia reel, splash boats, mini helicopters, lay-down, suspended monorail, reverser, heartline twister, mini golf, giga, roto-drop, flying saucers, crooked house, monorail cycles, compact inverted, water coaster, air-powered vertical, inverted hairpin, magic carpet, submarine, river rafts, enterprise, inverted impulse, mini coaster, mine ride, LIM launched, hypercoaster, hyper-twister, monster trucks, spinning wild mouse, (+OpenRCT2 additions: classic mini, hybrid, single rail, alpine, classic wooden, classic stand-up, LSM launched, classic wooden twister).
- G-forces: vertical from pitch + |v|*98/vertFactor(track piece); lateral |v|*98/lateralFactor; air time counts while verticalG ≤ 0. Water splash ≥ 11 mph.
### Staff behaviour
- Handyman: litter radius 3 tiles; mows when timeout ≥12; waters gardens (age reset); empties bins. Mechanic: re-calls after 2500 ticks; fixing substates per breakdown. Security: 20+ guests within 3 tiles → slow walk. Entertainer: 25% chance per update to wave/joy; nearby walking guests +4 happiness target, queuers +3 and queue time −200.
### Awards (random one checked each month, lasts 5 months)
- Most untidy (litter/vandalism thoughts > guests/16) · Most tidy (clean thoughts > guests/64 and ≤5 complaints) · Best coasters (≥6 open coasters) · Best value (fee + 0.10 < ride value/2, value ≥10) · Most beautiful (scenery thoughts > guests/128, ≤15 negatives) · Worst value (fee > total ride value) · Safest (≤2 vandalism thoughts, no crashes) · Best staff (all 4 types, ≥20, ≥guests/32) · Best food (≥7 food shops, ≥4 types, ≤12 hungry) · Worst food (≤2 types, >15 hungry) · Best toilets (≥4, ≤16 needing) · Most disappointing (rating ≤650, half of rides unpopular) · Best water rides (≥6) · Best custom rides (≥6 with E ≥5.50) · Most dazzling colours (≥5 bright purple/green/orange/pink coasters) · Most confusing layout (≥10 lost, ≥guests/64) · Best gentle rides (≥10).
### Scenarios
- RCT2 base: Electric Fields (700 guests Y2), Factory Capers (1100 Y3), Crazy Castle (1500 Y4), Dusty Greens ($5k/month ride income), Bumbly Bazaar ($1k/month shop income), Infernal Views (10 coasters ≥6.00), Lucky Lake, Botany Breakers ($10k/month ride income), Alpine Adventures, Gravity Gardens ($500k value + repay loan, coasters only), Extreme Heights, Amity Airfield (3000 Y4), Ghost Town, Fungus Woods (2500 Y4, wooden rides), Rainbow Summit.
- Objective check: dated objectives checked monthly (daily if "allow early completion"); "guests and rating" etc. daily; low-rating warnings at 1/8/15/22 days; failure sets company value to a failed marker.
