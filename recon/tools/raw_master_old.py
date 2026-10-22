"""Decodifica le righe binarie di stage, enemy e medal di una versione vecchia del gioco.

    python -I recon/tools/raw_master_old.py <tabella> <righe.json> <uscita.json>

Le righe sono quelle di thethiny/KHUx-Server data/<tabella>_raw.json
([{"_id", "_raw": "<esadecimale>", "_size"}]): stage 1.020 byte, enemy 1.100, medal 1.300.
La struttura non e' quella della 4.3.1 (raw_master.py): le stringhe sono char[N+1]
(128 -> 129, 64 -> 65, 512 -> 513) e mancano o cambiano alcuni campi. Gli offset sono
ricavati confrontando le righe con valori noti: stage.json di thethiny (8 stage comuni),
la tabella enemy della 5.0.1 (7 nemici comuni), wiki\\medals.json (9 medaglie comuni).
I nomi sono quelli della 4.3.1; unk_<offset> = campo presente ma di significato incerto.

Gli elementi degli array oltre il contatore valid* contengono residui di memoria (pezzi
di stringhe di altre righe): si azzerano. I dati restano fuori dal repository.
"""
import json
import struct
import sys

# (nome, offset, tipo, quanti, contatore): tipo 'i' int32, 's<N>' stringa di N byte
LAYOUT = {
    'stage': (1020, [
        ('stageId', 0, 'i'), ('stageBinId', 4, 'i'), ('name', 8, 's129'), ('mapName', 137, 's129'),
        ('useAp', 268, 'i'), ('chapterId', 272, 'i'), ('worldId', 276, 'i'), ('thumbId', 280, 'i'),
        ('unk_284', 284, 'i'), ('unk_288', 288, 'i'),
        ('validBeforeDrama', 292, 'i'), ('beforeDramaId', 296, 'i', 5, 'validBeforeDrama'),
        ('beforeDramaType', 316, 'i', 5, 'validBeforeDrama'),
        ('validAfterDrama', 336, 'i'), ('afterDramaId', 340, 'i', 5, 'validAfterDrama'),
        ('afterDramaType', 360, 'i', 5, 'validAfterDrama'),
        ('validClearGetTitle', 380, 'i'), ('clearGetTitle', 384, 'i'),
        ('validClearGetSphere', 388, 'i'), ('clearGetSphere', 392, 'i'), ('resetClearGet', 396, 'i'),
        ('validClearGetItem', 400, 'i'),
        ('clearGetItemType', 404, 'i', 3, 'validClearGetItem'), ('clearGetItemId', 416, 'i', 3, 'validClearGetItem'),
        ('clearGetAssignSkillType', 428, 'i', 3, 'validClearGetItem'),
        ('clearGetAssignSkillId', 440, 'i', 3, 'validClearGetItem'),
        ('clearGetAssignSkillLv', 452, 'i', 3, 'validClearGetItem'),
        ('clearGetItemNum', 464, 'i', 3, 'validClearGetItem'),
        ('resetSubMission', 476, 'i'), ('validSubmission', 480, 'i'),
        ('submissionRequire', 484, 'i', 3, 'validSubmission'),
        ('submissionName', 496, 's129', 3, 'validSubmission'),
        ('submissionDataType', 884, 'i', 3, 'validSubmission'),
        ('submissionIdType', 896, 'i', 3, 'validSubmission'),
        ('submissionId', 908, 'i', 3, 'validSubmission'),
        ('submissionNum', 920, 'i', 3, 'validSubmission'),
        ('submissionRewardType', 932, 'i', 3, 'validSubmission'),
        ('submissionItemId', 944, 'i', 3, 'validSubmission'),
        ('submissionSkillType', 956, 'i', 3, 'validSubmission'),
        ('submissionSkillId', 968, 'i', 3, 'validSubmission'),
        ('submissionSkillLv', 980, 'i', 3, 'validSubmission'),
        ('submissionItemNum', 992, 'i', 3, 'validSubmission'),
        ('raidBoss', 1004, 'i'),  # nome dato da thethiny; 0 nel Prologue, 2000/3000 dopo
        ('bgmField', 1008, 'i'), ('bgmBattle', 1012, 'i'), ('bgmBoss', 1016, 'i'),
    ]),
    'enemy': (1100, [
        ('enemyId', 0, 'i'), ('name', 4, 's65'), ('flavor', 69, 's513'),
        ('displayId', 584, 'i'), ('show', 588, 'i'), ('showSwf', 592, 'i'), ('showFrame', 596, 'i'),
        ('hideFrame', 600, 'i'), ('moveSpeed', 604, 'i'), ('hitRadius', 608, 'i'), ('tapRadius', 612, 'i'),
        ('width', 616, 'i'), ('height', 620, 'i'), ('unk_624', 624, 'i'), ('unk_628', 628, 'i'),
        ('kind', 632, 'i'), ('attribute', 636, 'i'), ('validGrowth', 640, 'i'),
        # cinque livelli (la 4.3.1 ne ha sei)
        ('baseLv', 644, 'i', 5), ('hp', 664, 'i', 5), ('attack', 684, 'i', 5), ('defense', 704, 'i', 5),
        ('exp', 724, 'i', 5), ('money', 744, 'i', 5), ('raidPoint', 764, 'i', 5), ('lux', 784, 'i', 5),
        ('score', 804, 'i', 5),
        ('attackCp', 824, 'i'), ('suppressCp', 828, 'i'), ('attackHp', 832, 'i'), ('suppressHp', 836, 'i'),
        ('unk_840', 840, 'i'), ('battlePattern', 844, 'i'), ('displayHeight', 848, 'i'),
        ('uiDisplayHeight', 852, 'i'), ('unk_856', 856, 'i'),
        ('validUrgency', 880, 'i'),
        ('urgency', 884, 'i', 3, 'validUrgency'), ('urgencyValue', 896, 'i', 3, 'validUrgency'),
        ('urgencyFrequency', 908, 'i', 3, 'validUrgency'), ('urgencySkillId', 920, 'i', 3, 'validUrgency'),
        ('unk_932', 932, 'i', 3, 'validUrgency'),
        ('validSkill', 944, 'i'), ('skillId', 948, 'i', 4, 'validSkill'),
        ('skillRequire', 964, 'i', 4, 'validSkill'), ('skillRequireArg', 980, 'i', 4, 'validSkill'),
        ('skillOdds', 996, 'i', 4, 'validSkill'),
        ('protectPoison', 1012, 'i'), ('protectDeepPoison', 1016, 'i'), ('protectSleep', 1020, 'i'),
        ('protectParalysis', 1024, 'i'), ('registPoison', 1028, 'i'), ('registDeepPoison', 1032, 'i'),
        ('registSleep', 1036, 'i'), ('registParalysis', 1040, 'i'),
        ('bufAttack', 1044, 'i'), ('bufDefense', 1048, 'i'), ('bufAttackPower', 1052, 'i'),
        ('bufDefensePower', 1056, 'i'), ('bufAttackSpeed', 1060, 'i'), ('bufDefenseSpeed', 1064, 'i'),
        ('bufAttackMagic', 1068, 'i'), ('bufDefenseMagic', 1072, 'i'), ('bufAttackUpright', 1076, 'i'),
        ('bufDefenseUpright', 1080, 'i'), ('bufAttackReverse', 1084, 'i'), ('bufDefenseReverse', 1088, 'i'),
        ('bufTurn', 1092, 'i'), ('bufCount', 1096, 'i'),
    ]),
    'medal': (1300, [
        ('medalId', 0, 'i'), ('imageId', 4, 'i'), ('thumbId', 8, 'i'), ('unk_12', 12, 'i'),
        ('unk_16', 16, 'i'), ('sortId', 20, 'i'),  # sortId = numero della medaglia sulla wiki
        ('name', 24, 's65'), ('flavor', 89, 's513'), ('advantage', 602, 's513'),
        ('unk_1116', 1116, 'i'), ('type', 1120, 'i'), ('attribute', 1124, 'i'), ('darklight', 1128, 'i'),
        ('validSource', 1132, 'i'), ('source', 1136, 'i', 3, 'validSource'),
        ('rare', 1148, 'i'), ('skillSlot', 1152, 'i'), ('unk_1156', 1156, 'i'),
        ('maxLv', 1160, 'i'), ('expType', 1164, 'i'), ('cost', 1168, 'i'), ('minCost', 1172, 'i'),
        ('growthType', 1176, 'i'),
        ('attack', 1180, 'i'), ('maxAttack', 1184, 'i'), ('addMaxAttack', 1188, 'i'),
        ('defense', 1192, 'i'), ('maxDefense', 1196, 'i'), ('addMaxDefense', 1200, 'i'),
        ('validBurst', 1204, 'i'), ('burstId', 1208, 'i'),
        ('unk_1212', 1212, 'i'), ('unk_1216', 1216, 'i'), ('unk_1220', 1220, 'i'), ('unk_1224', 1224, 'i'),
        ('materialExp', 1228, 'i'), ('sell', 1232, 'i'), ('sellPerLv', 1236, 'i'),
        ('enhanceAttack', 1240, 'i'), ('enhanceDefense', 1244, 'i'), ('enhanceCost', 1248, 'i'),
        ('enhanceGuilt', 1252, 'i'),
        ('validEvolve', 1256, 'i'), ('evolveId', 1260, 'i'), ('evolveMoney', 1264, 'i'),
        ('validEvolveNeed', 1268, 'i'), ('evolveNeedId', 1272, 'i', 5, 'validEvolveNeed'),
        ('voice', 1292, 'i'), ('bgm', 1296, 'i'),
    ]),
}


def read(b, off, ty):
    if ty == 'i':
        return struct.unpack_from('<i', b, off)[0]
    n = int(ty[1:])
    return b[off:off + n].split(b'\0', 1)[0].decode('utf-8', 'replace')


def width(ty):
    return 4 if ty == 'i' else int(ty[1:])


def decode(table, b):
    size, fields = LAYOUT[table]
    if len(b) != size:
        raise ValueError('riga di %d byte, attesi %d' % (len(b), size))
    row = {}
    for f in fields:
        name, off, ty = f[:3]
        if len(f) == 3:
            row[name] = read(b, off, ty)
            continue
        count = f[3]
        valid = row[f[4]] if len(f) > 4 else count
        zero = 0 if ty == 'i' else ''
        row[name] = [read(b, off + width(ty) * k, ty) if k < valid else zero for k in range(count)]
    return row


def main():
    table, src, out = sys.argv[1:4]
    rows = json.load(open(src, encoding='utf-8'))
    decoded = [decode(table, bytes.fromhex(r['_raw'])) for r in rows]
    json.dump(decoded, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%s: %d righe -> %s' % (table, len(decoded), out))


if __name__ == '__main__':
    main()
