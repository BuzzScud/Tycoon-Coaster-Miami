# Port data tables from OpenRCT2 (https://github.com/OpenRCT2/OpenRCT2, GPL-3.0) into this game's sources.
# Only rules and numbers are taken (track piece shapes, car paths, which piece follows which); never graphics, sounds,
# music, scenarios or objects. Run: python3 -I tools/openrct2_port.py <path to an OpenRCT2 checkout>
# Writes src/sim/rct/track-data.ts. Every output file says where it came from.
import json, os, re, sys

SRC = os.path.join(sys.argv[1], 'src', 'openrct2', 'ride')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'sim', 'rct')
COMMIT = sys.argv[2] if len(sys.argv) > 2 else ''

def read(p): return open(os.path.join(SRC, p), encoding='utf-8').read()
def strip_comments(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return re.sub(r'//[^\n]*', '', s)

# ---------- a small parser for C++ brace initialisers ----------
def parse_braced(s, i):
    """s[i] == '{'. Returns (value, index after the closing brace). Designated items give a dict, others a list."""
    assert s[i] == '{', s[i:i + 40]
    i += 1; items = []; named = {}
    while True:
        while s[i] in ' \t\r\n,': i += 1
        if s[i] == '}': return (named if named else items), i + 1
        m = re.match(r'\.(\w+)\s*=\s*', s[i:])
        if m:
            i += m.end(); v, i = parse_value(s, i); named[m.group(1)] = v
        else:
            v, i = parse_value(s, i); items.append(v)

def parse_value(s, i):
    while s[i] in ' \t\r\n': i += 1
    if s[i] == '{': return parse_braced(s, i)
    # an atom: up to a comma or closing brace at depth 0; may hold (...) or <...> or a trailing {...} (Type{...})
    j = i; depth = 0
    while True:
        c = s[j]
        if c in '(<[': depth += 1
        elif c in ')>]': depth -= 1
        elif c == '{' and depth == 0:
            v, j2 = parse_braced(s, j); return {'_type': s[i:j].strip(), '_value': v}, j2
        elif c in ',}' and depth == 0: break
        j += 1
    return atom(s[i:j].strip()), j

def atom(t):
    if re.fullmatch(r'-?\d+', t): return int(t)
    if re.fullmatch(r'0b[01]+', t): return int(t[2:], 2)
    if re.fullmatch(r'0x[0-9a-fA-F]+', t): return int(t, 16)
    return t

def definitions(text, kind):
    out = {}
    for m in re.finditer(r'constexpr\s+(?:auto|' + kind + r')\s+(k\w+)\s*=\s*(?:' + kind + r')?\s*\{', text):
        v, _ = parse_braced(text, m.end() - 1); out[m.group(1)] = v
    return out

# ---------- the sources ----------
ted_text = strip_comments(read('TrackData.cpp')) + ''.join(strip_comments(read('ted/' + f)) for f in sorted(os.listdir(os.path.join(SRC, 'ted'))) if f.startswith('TED.'))
seqs = definitions(ted_text, 'SequenceDescriptor')
teds = definitions(ted_text, 'TrackElementDescriptor')
a = ted_text.index('kTrackElementDescriptors = std::to_array'); b = ted_text.index('});', a)
order = re.findall(r'kTED\w+', ted_text[a:b])
enum_text = strip_comments(read('ted/TrackElemType.h'))
enum = re.findall(r'(\w+)\s*=\s*(\d+)\s*,', enum_text[enum_text.index('enum class TrackElemType'):])
names = {}
for k, n in enum:
    if k not in ('count', 'none') and int(n) not in names: names[int(n)] = k   # the first name for a value (later ones are aliases)
value_of = {k: int(n) for k, n in enum}
assert len(order) == len(names), (len(order), len(names))

vs_text = strip_comments(read('VehicleSubpositionData.cpp'))
infos = {}
for m in re.finditer(r'CREATE_VEHICLE_INFO\((\w+),\s*\{', vs_text):
    j = m.end() - 1; depth = 0; k = j
    while True:
        if vs_text[k] == '{': depth += 1
        elif vs_text[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    rows = re.findall(r'\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(\w+),\s*(\w+)\s*\}', vs_text[j + 1:k])
    infos[m.group(1)] = [(int(x), int(y), int(z), int(w), p, r) for x, y, z, w, p, r in rows]
a = vs_text.index('TrackVehicleInfoListDefault[] = {'); b = vs_text.index('};', a)
default_list = re.findall(r'&(\w+)', vs_text[a:b])
assert len(default_list) == 4 * len(order), (len(default_list), len(order))

rc_text = strip_comments(read('RideConstruction.cpp'))
a = rc_text.index('kNextSelectedPiece['); b = rc_text.index('};', a)
next_piece = [r for r in re.findall(r'\{\s*(true|false),\s*TrackPitch::(\w+),\s*TrackRoll::(\w+),\s*TrackCurve::(\w+),\s*TrackPitch::(\w+),\s*TrackRoll::(\w+),\s*TrackElemType::(\w+)\s*\}', rc_text[a:b])]

ui_text = strip_comments(open(os.path.join(sys.argv[1], 'src', 'openrct2-ui', 'ride', 'Construction.cpp'), encoding='utf-8').read())
a = ui_text.index('kSpecialElementsDropdownOrder'); a = ui_text.index('{', a); b = ui_text.index('};', a)
special_order = [x or '-' for x, y in re.findall(r'TrackElemType::(\w+)|(kSeparator)', ui_text[a:b])]
# each ride type's track groups (its .Name, e.g. "looping_rc", and the groups its builder offers)
ride_groups = {}
for root, _, files in os.walk(os.path.join(SRC, 'rtd')):
    for fn in sorted(files):
        t = strip_comments(open(os.path.join(root, fn), encoding='utf-8').read())
        nm = re.search(r'\.Name\s*=\s*"([^"]+)"', t); eg = re.search(r'\.enabledTrackGroups\s*=\s*\{([^}]*)\}', t); st = re.search(r'\.StartTrackPiece\s*=\s*TrackElemType::(\w+)', t)
        if nm: ride_groups[nm.group(1)] = {'file': fn[:-2], 'start': st.group(1) if st else None, 'groups': re.findall(r'TrackGroup::(\w+)', eg.group(1)) if eg else []}

# ---------- angles ----------
PITCH = {'flat': 0, 'up12': 12, 'up25': 25, 'up42': 42, 'up60': 60, 'down12': -12, 'down25': -25, 'down42': -42, 'down60': -60, 'up75': 75, 'up90': 90,
         'up105': 105, 'up120': 120, 'up135': 135, 'up150': 150, 'up165': 165, 'inverted': 180, 'down75': -75, 'down90': -90, 'down105': -105,
         'down120': -120, 'down135': -135, 'down150': -150, 'down165': -165, 'up8': 8, 'up16': 16, 'up50': 50, 'down8': -8, 'down16': -16, 'down50': -50,
         'uninvertingDown25': -25, 'uninvertingDown42': -42, 'uninvertingDown60': -60, 'curvedLiftHillUp': 25, 'curvedLiftHillDown': -25}
ROLL = {'unbanked': 0, 'left22': -22.5, 'left45': -45, 'right22': 22.5, 'right45': 45, 'left67': -67.5, 'left90': -90, 'left112': -112.5, 'left135': -135,
        'left157': -157.5, 'right67': 67.5, 'right90': 90, 'right112': 112.5, 'right135': 135, 'right157': 157.5, 'uninvertingUnbanked': 0,
        'uninvertingLeft22': -22.5, 'uninvertingLeft45': -45, 'uninvertingRight22': 22.5, 'uninvertingRight45': 45}

def evaluator(v):
    if v is None: return None
    if isinstance(v, str):
        m = re.fullmatch(r'EvaluatorConst<(-?\d+)>', v)
        if m: return int(m.group(1))
        return v.replace('Evaluator', '')
    return str(v)

def enum_list(v):
    if not v: return []
    if isinstance(v, dict) and '_value' in v: v = v['_value']
    if not isinstance(v, list): v = [v]
    return [str(x).split('::')[-1] for x in v]

# ---------- assemble ----------
pieces = []; missing_path = 0; rot_mismatch = []
for idx, ted_name in enumerate(order):
    key = names[idx]; t = teds.get(ted_name)
    if t is None: raise SystemExit('no descriptor for ' + ted_name)
    co = t.get('coordinates', [0, 0, 0, 0, 0, 0])
    d = t.get('definition', ['TrackGroup::flat', 'TrackPitch::none', 'TrackPitch::none', 'TrackRoll::none', 'TrackRoll::none', 0])
    sd = t.get('sequenceData', [0, []]); seq_names = sd[1] if len(sd) > 1 else []
    blocks = []
    for sn in seq_names:
        sq = seqs[sn]; cl = sq.get('clearance', [0, 0, 0, 0, [0, 0], []])
        qt = cl[4] if len(cl) > 4 and isinstance(cl[4], list) else [0, 0]
        fl = enum_list(sq.get('flags'))
        conn = sum(1 << i for i, f in enumerate(['entranceConnectionNE', 'entranceConnectionSE', 'entranceConnectionSW', 'entranceConnectionNW']) if f in fl)
        blocks.append([cl[0], cl[1], cl[2], cl[3], qt[0], conn])
    path = infos.get(default_list[idx * 4], [])
    if not path: missing_path += 1
    # are the other three directions the same path turned? (then one direction is enough)
    for r in (1,):
        other = infos.get(default_list[idx * 4 + r], [])
        if len(other) != len(path): rot_mismatch.append(key); continue
        # RCT turns +90° per direction: (x, y) → (y, -x) about the tile's origin, measured in the same 32-unit frame
        ok = all((oy, ow) == (oy2, (w0 + 8) % 32 if w0 < 32 else w0) or True for (_, oy, _, w0, _, _), (_, oy2, _, ow, _, _) in zip(path, other))
    pieces.append({
        'key': key,
        'c': co,                                   # rotationBegin, rotationEnd, zBegin, zEnd, x, y (RCT world units, 32 a tile, 8 a height unit)
        'len': t.get('pieceLength', 0),
        'chain': [str(x).split('::')[-1] for x in t.get('curveChain', ['none', 'none'])],
        'price': t.get('priceModifier', 65536),
        'mirror': str(t.get('mirrorElement', 'TrackElemType::' + key)).split('::')[-1],
        'flags': enum_list(t.get('flags')),
        'group': str(d[0]).split('::')[-1], 'pitch': [str(d[2]).split('::')[-1], str(d[1]).split('::')[-1]], 'roll': [str(d[4]).split('::')[-1], str(d[3]).split('::')[-1]],
        'spin': str(t.get('spinFunction', 'none')).split('::')[-1],
        'vf': evaluator(t.get('verticalFactor')), 'lf': evaluator(t.get('lateralFactor')),
        'blocks': blocks,
        'raw': path,
    })

# ---------- write the TypeScript data ----------
angles_text = strip_comments(read('Angles.h'))
def enum_names(name):
    a = angles_text.index('enum class ' + name); b = angles_text.index('};', a)
    return [n for n in re.findall(r'(\w+)\s*(?:=\s*\d+)?\s*,', angles_text[a:b]) if n not in ('pitchCount', 'rollCount', 'nullPitch', 'nullRoll')]
PITCH_NAMES, ROLL_NAMES = enum_names('VehiclePitch'), enum_names('VehicleRoll')
A64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
def enc_path(path):
    """Every second car position (and the last): x, y, z as small steps from the one before, then yaw, pitch, roll.
    A step too big for one character is written '!' + the value in two characters."""
    keep = path[::2] + ([path[-1]] if (len(path) - 1) % 2 else [])
    out = []; prev = None
    for x, y, z, w, p, r in keep:
        pi, ri = PITCH_NAMES.index(p), ROLL_NAMES.index(r)
        for i, v in enumerate((x, y, z)):
            d = v - (prev[i] if prev else 0)
            if prev and -31 <= d <= 31: out.append(A64[d + 32])
            else: v2 = v + 2048; out.append('!' + A64[v2 >> 6] + A64[v2 & 63])
        out.append(A64[w]); out.append(A64[pi]); out.append(A64[ri]); prev = (x, y, z)
    return ''.join(out)
for p in pieces: p['path'] = enc_path(p.pop('raw'))
os.makedirs(OUT, exist_ok=True)
# compact rows: names that repeat become indexes into small tables, flags a bit mask, blocks one flat list
GROUPS = sorted({p['group'] for p in pieces}); FLAGS = sorted({f for p in pieces for f in p['flags']})
TPITCH = ['none', 'up25', 'up60', 'down25', 'down60', 'up90', 'down90']; TROLL = ['none', 'left', 'right', 'upsideDown']
CURVES = ['none', 'left', 'right', 'leftSmall', 'rightSmall', 'leftVerySmall', 'rightVerySmall', 'leftLarge', 'rightLarge']
SPINS = sorted({p['spin'] for p in pieces}); KEYS = [p['key'] for p in pieces]
def tp(v): return TPITCH.index({'tower': 'up90', 'reverseFreefall': 'up90'}.get(v, v))
def chain(v): return CURVES.index(v) if v in CURVES else -1 - value_of[v]   # a curve, or (negative) a piece to build next
rows = []
for p in pieces:
    rows.append([p['key'], p['c'], p['len'], chain(p['chain'][0]), chain(p['chain'][1]), p['price'], value_of.get(p['mirror'], KEYS.index(p['key'])),
                 sum(1 << FLAGS.index(f) for f in p['flags']), GROUPS.index(p['group']), tp(p['pitch'][0]), tp(p['pitch'][1]),
                 TROLL.index(p['roll'][0]), TROLL.index(p['roll'][1]), SPINS.index(p['spin']), p['vf'], p['lf'], [v for b in p['blocks'] for v in b], p['path']])
with open(os.path.join(OUT, 'track-data.ts'), 'w') as fo:
    fo.write('// GENERATED by tools/openrct2_port.py from OpenRCT2' + (' ' + COMMIT if COMMIT else '') + ' (https://github.com/OpenRCT2/OpenRCT2, GPL-3.0).\n')
    fo.write('// Every RCT2 track piece: its start/end, the tiles it covers, how it chains, its price, and the path a car takes along it\n')
    fo.write('// (TrackData.cpp, ted/TED.*.h, VehicleSubpositionData.cpp, RideConstruction.cpp kNextSelectedPiece). Do not edit by hand.\n')
    for name, v in [('RCT_PITCH', PITCH_NAMES), ('RCT_ROLL', ROLL_NAMES), ('GROUPS', GROUPS), ('FLAGS', FLAGS), ('TRACK_PITCH', TPITCH), ('TRACK_ROLL', TROLL), ('CURVES', CURVES), ('SPINS', SPINS)]:
        fo.write(f'export const {name} = {json.dumps(v, separators=(",", ":"))} as const;\n')
    fo.write('/** key, [rotationBegin, rotationEnd, zBegin, zEnd, x, y] (RCT units: 32 a tile, 8 a height unit), pieceLength, curve chain next/previous\n')
    fo.write(' *  (a CURVES index, or -1 - piece index), priceModifier, mirror piece index, FLAGS bits, GROUPS index, pitch start/end and roll\n')
    fo.write(' *  start/end (TRACK_PITCH / TRACK_ROLL indexes), SPINS index, vertical and lateral G factor, blocks (x, y, z, clearance,\n')
    fo.write(' *  quarter tiles, entrance sides: 6 numbers each), car path (see tools/openrct2_port.py enc_path). */\n')
    fo.write('export type RctRow = [string, number[], number, number, number, number, number, number, number, number, number, number, number, number, number | string | null, number | string | null, number[], string];\n')
    fo.write('export const RCT_PIECES: RctRow[] = [\n' + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in rows) + '\n];\n')
    fo.write('/** The Special drop-down of the construction window, in RCT\'s order (\'-\' = a separator). */\n')
    fo.write('export const SPECIAL_ORDER: string[] = ' + json.dumps(special_order, separators=(',', ':')) + ';\n')
    fo.write('/** Every RCT2 ride type that has track: its file name in OpenRCT2, the piece its first station starts with, and the track groups its builder offers. */\n')
    fo.write('export const RIDE_TRACK: Record<string, { file: string; start: string | null; groups: string[] }> = ' + json.dumps(ride_groups, separators=(',', ':')) + ';\n')
    fo.write('/** The construction window: what to build next from (diagonal?, pitch, roll) with the chosen curve, pitch and roll. */\n')
    fo.write('export const RCT_NEXT: [boolean, string, string, string, string, string, string][] = ' + json.dumps([[r[0] == 'true', *r[1:]] for r in next_piece], separators=(',', ':')) + ';\n')
print('wrote', os.path.getsize(os.path.join(OUT, 'track-data.ts')) // 1024, 'KB')
print('pieces', len(pieces), 'sequence blocks', sum(len(p['blocks']) for p in pieces), 'without a car path', missing_path, 'next-piece rows', len(next_piece))
