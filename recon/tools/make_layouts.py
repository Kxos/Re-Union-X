"""Layout cocostudio sostitutivi per le schermate i cui layout non sono in nessuna risorsa.

    python -I recon/tools/make_layouts.py <cartella layout estratti> <uscita>

<cartella layout estratti> = dove res_get.py ha estratto i layout esistenti (contiene
cocostudio/publish/...); <uscita> = la cartella del pacchetto generato (es.
D:\\Progetto_Restauro_KH_UX\\stage_gen\\files), dove finiscono cocostudio/publish/<nome>.

Ogni voce di LAYOUTS dice come ottenere un layout mancante:
  ('copy', sorgente, {vecchio nome widget: nuovo})  copia di un layout esistente
  ('scene', [nodi])                                 scena SceneEditor con nodi vuoti
I nomi dei widget che il codice cerca si ricavano con widget_lookup.py sul C delle
funzioni che citano il layout (who_refs.py sulla stringa del percorso). Le immagini
restano quelle della sorgente (texture gia' nelle risorse).
"""
import json
import os
import plistlib
import re
import shutil
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
PUB = 'cocostudio/publish/'


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # with python -I the script folder is not on sys.path
import private_tools  # noqa: E402  (local reference data folders, see private_tools.py)
def jp_latest(name):
    """Percorso assoluto della revisione piu' alta di cocostudio/publish/<name> nei dati JP 4.3.1 (cartella di riferimento locale)
    (nomi <stem>.<8 cifre>.<ext>, come latest() di import_jp_coco.py); <name> nella cartella WW se i dati JP mancano.
    Assoluto: os.path.join(SRC, PUB, assoluto) lo tiene cosi' com'e' nelle voci 'copy'."""
    d = private_tools.local_path('jp_data', 'cocostudio', 'publish')
    stem, ext = os.path.splitext(name)
    revs = sorted(f for f in os.listdir(d) if f.startswith(stem + '.') and f.endswith(ext)
                  and f[len(stem) + 1:-len(ext)].isdigit()) if os.path.isdir(d) else []
    return os.path.abspath(os.path.join(d, revs[-1])) if revs else name

# Texture Dark Road -> KHUX: si toglie il prefisso dark_ se l'immagine esiste in KHUX,
# altrimenti queste sostituzioni (scelte a occhio tra le cornici KHUX).
DARK_TO_KHUX = {'dark_Plate07.png': 'Panel04.png', 'dark_Win02.png': 'Win01.png', 'dark_Win12.png': 'Win11.png',
                'dark_But_Close_Off.png': 'But_CloseA.png', 'dark_But_Close_On.png': 'But_CloseB.png'}


def B(name, x, y, w, h, tex, text=None, size=24, **kw):
    """Pulsante con testo opzionale (Label figlia, stesso nome con Txt_ al posto di Button_
    se non indicato)."""
    ch = kw.pop('children', [])
    if text is not None:
        ch = [L(kw.pop('label', 'Txt_' + name.split('_', 1)[-1]), 0, 0, w - 10, h - 8, text, size)] + ch
    return dict(cls='Button', name=name, x=x, y=y, w=w, h=h, tex=tex, children=ch, **kw)


def C(name, x, y, w, h, tex, children=(), **kw):
    """CheckBox (texture <tex>_Off/_On come i filtri del popup Sort)."""
    return dict(cls='CheckBox', name=name, x=x, y=y, w=w, h=h, tex=tex, children=list(children), **kw)


def L(name, x, y, w, h, text='', size=22, **kw):
    return dict(cls='Label', name=name, x=x, y=y, w=w, h=h, text=text, size=size, **kw)


def I(name, x, y, w, h, tex, **kw):
    return dict(cls='ImageView', name=name, x=x, y=y, w=w, h=h, tex=tex, **kw)


def A(name, x, y, tex, item_w, item_h, text='0', start='0', **kw):
    """LabelAtlas (TextAtlas: cifre prese da una texture a celle item_w x item_h, la prima e'
    il carattere start), come AtlasLabel_NumL di AvatarInfo_Txt_ver340."""
    return dict(cls='LabelAtlas', name=name, x=x, y=y, w=item_w * len(text), h=item_h, tex=tex,
                item=(item_w, item_h), start=start, text=text, **kw)


# targhetta Plate03 in 9-slice come in MedalInfo_Mix_ver340 (bordo 70)
PLATE3 = dict(scale9Enable=True, capInsetsX=70, capInsetsY=0, capInsetsWidth=1, capInsetsHeight=1)
# fondo e bordo dei riquadri come in DeckEdit_MedalForm (Win_under, Win)
# pulsanti come DeckEdit_MedalForm (Button_Sort 178x53): 9-slice orizzontale, bordo 30
BUT9 = dict(scale9Enable=True, capInsetsX=30, capInsetsY=0, capInsetsWidth=1, capInsetsHeight=1)
# il 9-slice non abbassa sotto i 68 px della texture (bordo inferiore di 67): per l'altezza
# degli screenshot originali (52) si scala il widget intero
BUTS = dict(BUT9, scaleX=0.765, scaleY=0.765)
# pulsanti piu' alti della texture (68): stiramento verticale al centro
TALL9 = dict(BUT9, capInsetsY=32, capInsetsHeight=4)
PANEL4 = dict(scale9Enable=True, capInsetsX=50, capInsetsY=50, capInsetsWidth=1, capInsetsHeight=1)
# fondo della griglia scurito come negli screenshot originali (quasi nero, bordo blu)
GRID = dict(PANEL4, colorR=70, colorG=85, colorB=120)
# Panel a tinta unita (cocostudio 1.6: colorType 1), rosso della fascia di avviso
RED_BG = dict(colorType=1, bgColorR=233, bgColorG=18, bgColorB=38, bgColorOpacity=255)
PANEL15 = dict(scale9Enable=True, capInsetsX=50, capInsetsY=0, capInsetsWidth=1, capInsetsHeight=1)
# riquadro blu con il bordo chiaro (Win09 100x119) dei riquadri in basso della bacheca
# (zona elastica al centro: bordi fissi 40+40, cosi' scende fino a 80x80; con 20 e 1 il bordo
# inferiore era di 98 px e il riquadro non si abbassava, banco z2_board)
WIN9 = dict(scale9Enable=True, capInsetsX=40, capInsetsY=40, capInsetsWidth=20, capInsetsHeight=39)
# But16 (218x52) stretto: zona elastica larga, bordi fissi di 30 (con BUT9 non scendeva sotto 217)
BUT16 = dict(scale9Enable=True, capInsetsX=30, capInsetsY=0, capInsetsWidth=158, capInsetsHeight=1)


def P(name, x, y, w, h, children=(), **kw):
    return dict(cls='Panel', name=name, x=x, y=y, w=w, h=h, children=list(children), **kw)


def obtain_panels(x, y):
    """Ricompense nei popup di vendita: Panel_1..Panel_4 con 1..4 targhette
    Obtain_Plate_a..d (Txt titolo, Txt_Label quantita', Icon ImageView di cui
    carica la texture). Il codice mostra solo il pannello con il numero giusto di righe."""
    panels = []
    for n in range(1, 5):
        plates = [P('Obtain_Plate_' + 'abcd'[k], 0, 120 - 40 * k, 400, 36, [
            I('Icon', 40, 18, 30, 30, 'Result_LU_Win_Star.png', scale=0.4),
            L('Txt', 130, 18, 180, 30, '', 20),
            L('Txt_Label', 320, 18, 140, 30, '0', 20)]) for k in range(n)]
        panels.append(P('Panel_%d' % n, x, y, 400, 160, plates, visible=False))
    return panels


def obtain_plates(cx, cy):
    """Come obtain_panels, nell'aspetto del popup «Complete!» originale
    (reference\\material_sell\\complete_thumb.png, video WiFh447niJY): una targa scura per
    riga larga quasi quanto la finestra, «Munny» a sinistra, icona al centro, quantita'
    gialla allineata a destra; righe centrate su (cx, cy), 40 l'una dall'altra."""
    panels = []
    for n in range(1, 5):
        plates = [P('Obtain_Plate_' + 'abcd'[k], 0, 40 * (n - 1 - k), 480, 36, [
            I('Base', 240, 18, 480, 30, 'Plate03.png', opts=PLATE3),
            L('Txt', 15, 18, 160, 30, '', 20, opts=dict(anchorPointX=0)),
            I('Icon', 240, 18, 44, 46, 'Icon_Prize.png', s9=False, scale=0.5),
            L('Txt_Label', 465, 18, 200, 30, '0', 22,
              opts=dict(anchorPointX=1, colorR=255, colorG=230, colorB=60))]) for k in range(n)]
        panels.append(P('Panel_%d' % n, cx - 240, cy - 20 * n, 480, 40 * n, plates, visible=False))
    return panels


def held_plates(y):
    """Possesso mostrato nelle conferme del Moogle Shop: jewel
    (LB_Jewel con «Held» in Txt_CrownPossessed e il numero in _Label, scritti dal codice) o
    Munny (LB_Munnies, Txt_MunniesPossessed_Label, Txt_Munnies), uno solo visibile secondo
    payType. Targhe centrate in x=480 della radice (finestra del popup OK/Annulla)."""
    return [
        I('LB_Jewel', 480, y, 360, 28, 'Plate03.png', opts=PLATE3, children=[
            I('Icon_Jewel', 15, 0, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.3)]),
        L('Txt_CrownPossessed', 400, y, 160, 28, 'Held', 22),
        L('Txt_CrownPossessed_Label', 570, y, 200, 28, '0', 22),
        I('LB_Munnies', 480, y - 32, 360, 28, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_MunniesPossessed_Label', -90, 0, 160, 24, 'Munny', 20),
            L('Txt_Munnies', 90, 0, 160, 24, '0', 20)])]


def reward_icons(x, y):
    """Icona grande di un premio (popup dei nodi degli Avatar Boards): un widget per
    tipo, cercati tutti dalla radice (senza uno: crash dopo lo sblocco, banco v32). Il codice
    mostra quello del tipo e ne carica la texture."""
    def icon(n):
        return I(n, x, y, 90, 90, 'IncentiveIcon_01.png', s9=False, visible=False)
    return ([icon(n) for n in ('MDL', 'SKL', 'KB', 'MTR', 'HP', 'AP', 'SG', 'COST', 'Incentive', 'Icon_Skil',
                                'MixCircle_Plate')]
            + [P('AVT', x - 45, y - 45, 90, 90, [
                I('Icon_Base', 45, 45, 90, 90, 'IncentiveIcon_01.png', s9=False),
                I('Icon_Avatar', 45, 45, 90, 90, 'IncentiveIcon_01.png', s9=False),
                I('Gender', 75, 75, 41, 61, 'Kind_0001.png', s9=False, scale=0.4)], visible=False),
               P('LuxBoard', x - 45, y - 45, 90, 90, [
                   I('Select_Board', 45, 45, 306, 306, 'Board_0001.png', s9=False, scale=0.3),
                   I('Select_Base', 45, 45, 306, 306, 'Board_0001.png', s9=False, scale=0.3),
                   I('Select_Kind', 45, 45, 306, 306, 'Kind_0001.png', s9=False, scale=0.3)], visible=False),
               # targa del titolo come AvatarTitle_PanelButton_Big: title_NNNN 610x82 intera (il
               # codice vi carica img/userTitle/title_<label>; in 9-slice si spezzava), nome
               # ancorato a sinistra; scala 0,8 per stare nella finestra dei popup
               I('RankTitle_Board', x, y, 610, 82, 'title_1000.png', s9=False, scale=0.8, visible=False,
                 children=[L('RankTitle_Name', -226, 0, 530, 42, '', 22, opts=dict(anchorPointX=0))]),
               P('Comment', x - 150, y - 30, 300, 60, [
                   I('Icon_Comment', 20, 30, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.4),
                   L('MultiComment_txt', 160, 30, 240, 50, '', 18)], visible=False),
               P('Area_MixCircle', x - 45, y - 45, 90, 90, visible=False)])


# Un ImageView in 9-slice con una texture assente da ogni risorsa manda in crash GUIReader
# (setScale9Enabled -> Scale9Sprite sul file mancante, SIGSEGV a 0x2c: pc 1372748, lr 12db038,
# 126f988, 1251ac8 loadTexture, 1251d94 setScale9Enabled, 11cfd88 lettore ImageView; banco
# absmax). Se il 9-slice e' spento la texture mancante e' tollerata. Plate21 (Countdown_panel di
# PopupNormal_Continue_Multi) non esiste nella 4.3.1: Plate18 (servita), senza 9-slice, nascosto.
NO_PLATE21 = ('tex', 'Countdown_panel', 'Plate18.png', dict(scale9Enable=False, visible=False))

LAYOUTS = {
    # Presents (scena base pannello): stessi
    # nomi della versione Dark Road (Txt_Wording, Scroll_Area, Txt_None, Txt_Stock*,
    # Button, Close_Button; Panel_Present). La scena toglie CenterUI e LeftUI.
    'PresentBOXScene.json': ('scene', ['CenterUI', 'LeftUI']),
    'PresentBOX_Base_ver400.json': ('copy', 'dark_PresentBOX_base.json', {}, True),
    'PresentBOX_Panel_ver131.json': ('copy', 'dark_PresentBOX_panel.json', {}, True),
    # Icona di un premio (anche nelle righe delle Missioni): la copia di Dark Road
    # non aveva i widget di KHUX (crash alla prima missione con premio, banco v32). Cerca dalla
    # radice LuxBoard (bacheca: Select_Board/Select_Base/Select_Kind), AVT (parte
    # dell'avatar: Icon_Avatar, Icon_Base, Gender), Star_Area, Incentive (icona
    # img/incentive/IncentiveIcon_NN, materiali, emblemi...), Medal (Medal_S), KB, Stamp
    'PresentBOX_IconPanel_ver131.json': ('build', P('PresentBOX_IconPanel', 0, 0, 80, 80, [
        I('Incentive', 40, 40, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.8),
        I('Medal', 40, 40, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.4, visible=False),
        I('KB', 40, 40, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.8, visible=False),
        I('Stamp', 40, 40, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.8, visible=False),
        P('Star_Area', 0, 0, 80, 16),
        P('AVT', 0, 0, 80, 80, [
            I('Icon_Base', 40, 40, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.8),
            I('Icon_Avatar', 40, 40, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.8),
            I('Gender', 66, 66, 41, 61, 'Kind_0001.png', s9=False, scale=0.3)], visible=False),
        P('LuxBoard', 0, 0, 80, 80, [
            I('Select_Board', 40, 40, 306, 306, 'Board_0001.png', s9=False, scale=0.26),
            I('Select_Base', 40, 40, 306, 306, 'Board_0001.png', s9=False, scale=0.26),
            I('Select_Kind', 40, 40, 306, 306, 'Kind_0001.png', s9=False, scale=0.26)], visible=False)])),

    # Medal List (e vicine carica la scena e cerca i widget da
    # li', ricorsivamente). Disposizione dalle schermate di riferimento
    # (reference\medal_list): in alto Sell Medals, Slots, criterio, Sort; sotto la griglia;
    # in basso la barra di vendita (Win_Bottom: Txt e Txt_Button sono Label).
    # LeftUI non puo' essere vuoto: ne prende il primo figlio (crash su vettore
    # vuoto). MedalSell_Back.json (pulsante Indietro) e' originale e gia' nelle risorse.
    'MedalListScene_ver130.json': ('scene', [('CenterUI', 'publish/MedalList_Gen.json'),
                                             ('LeftUI', 'publish/MedalSell_Back.json')]),
    # Medal_Sell_Panel e' la barra in alto: la rende visibile e vi cerca
    # Button_Sort (con la Label Txt_Sort, scritta dalla callback).
    'MedalList_Gen.json': ('build', P('medal_list_root', 0, 0, 960, 640, [
        # dietro la griglia: fondo scuro Panel04 (9-slice 50/50) e bordo Panel15 (bordo 50),
        # come DeckEdit_MedalForm; nell'originale va da sotto la barra fino al fondo
        # (reference\medal_list\medal_list_yt_06.jpg, medal_list_01.jpg)
        I('Grid_Under', 480, 220, 950, 490, 'Panel04.png', opts=GRID),
        # in alto passa sotto la barra (disegnata dopo), come negli originali: la prima riga
        # comincia subito sotto (medal_list_01.jpg: targhetta a 549 px su 1080)
        P('Scroll_Area', 3, 0, 954, 519),
        P('Medal_Sell_Panel', 0, 450, 960, 70, [
            I('Img_Bar', 480, 48, 1136, 111, 'Medal_Syn_DeckBase1.png', s9=False),
            B('Button_Sell1', 75, 33, 162, 68, 'But03', 'Sell\nMedals', 24, label='Txt_Sell1', opts=BUTS),
            I('Img_Slots', 250, 45, 218, 26, 'Plate03.png', opts=PLATE3),
            # contatore: Txt_MedalGet = testo 101200050 «Slots», poi medaglie
            # possedute (Num) / capienza (All), scritte con (Label con ombra)
            L('Txt_MedalGet', 180, 45, 80, 26, 'Slots', 17),
            L('Txt_MedalGet_Num_Label', 292, 45, 50, 26, '0', 18),
            L('Txt_MedalGet_Slash', 315, 45, 14, 26, '/', 18),
            L('Txt_MedalGet_All_Label', 337, 45, 50, 26, '0', 18),
            I('Img_SortType', 667, 45, 185, 26, 'Plate03.png', opts=PLATE3),
            # (barra di ordinamento generica) cerca qui anche Txt_Sort_Label
            # (criterio) e Txt_Filter_On (testo 100100012 «Filter ON»).
            L('Txt_Sort_Label', 667, 45, 180, 26, 'Strength', 18),
            L('Txt_Filter_On', 667, 22, 180, 20, 'Filter ON', 14),
            B('Button_Sort', 858, 33, 233, 68, 'But03', 'Sort', 30, opts=BUTS),
        ]),
        P('Win_Bottom', 0, 0, 960, 90, [
            I('Img_Win_Bottom', 480, 45, 960, 90, 'Plate13.png'),
            I('Img_Sell_Button', 150, 45, 200, 58, 'But16_Off.png'),
            L('Txt_Button', 150, 45, 190, 50, 'Sell', 26),
            L('Txt', 560, 45, 500, 40, '', 22),
        ], visible=False),
    ])),
    # Sell Medals (carica MedalSellScene_ver350, assente). Nomi e genitori dal
    # decompilato: dalla radice Scroll_Area, Txt_Money (100300003 «Munny»), Txt_A_Coin
    # (101500006 «Avatar Coins»), Txt_A_Coin_Label, DeckBase2, Txt_Money_Total_Lavel (sic),
    # Button_Back (da MedalSell_Back in LeftUI), BoxNow, BoxMaxLabel; in Medal_Sell_Panel
    # Txt_Money_Total, Button (con Txt_Sell) e la barra (Button_Sort...);
    # Plate_A_Jewel e Plate_A_Ticket con Txt_A_* e Txt_A_*_Label. Disposizione da
    # reference\medal_list\medal_sell_yt_02.jpg: in alto Slots, Munny, criterio, Sort; in
    # basso Sell e i ricavi (Munny, Avatar Coins).
    # usa il primo figlio di CenterUI, LeftUI e RightUI (vuoto: pannello).
    'MedalSellScene_ver350.json': ('scene', [('CenterUI', 'publish/MedalSell_Gen.json'),
                                             ('LeftUI', 'publish/MedalSell_Back.json'),
                                             ('RightUI', 'publish/MedalSell_Right.json')]),
    'MedalSell_Right.json': ('build', P('Panel_Right', 0, 0, 10, 10)),
    # Stile dalle schermate originali (reference\medal_list\web_reddit_sell_playingcard.jpg,
    # web_tumblr_sell1.png, medal_sell_yt_02.jpg): barre curve del Level Up
    # (Medal_Syn_DeckBase1 in alto, DeckBase2 in basso, come MedalInfo_Mix_ver340), targhette
    # Plate03 in 9-slice (bordo 70), Sort arancione (But03), Sell rosso (But01), icone delle
    # valute al centro delle targhette e valori a destra. Posizioni misurate sullo
    # screenshot di reddit (1334x750: x = 0,853·x' − 89, y = 0,853·(750 − y')).
    'MedalSell_Gen.json': ('build', P('medal_sell_root', 0, 0, 960, 640, [
        I('Grid_Under', 480, 270, 950, 390, 'Panel04.png', opts=GRID),
        P('Scroll_Area', 9, 95, 942, 428),
        # Medal_Sell_Panel = barra in alto (il codice la rende toccabile: a schermo intero
        # coprirebbe la griglia e la selezione non arriverebbe); i figli della barra in basso
        # stanno fuori dai suoi bordi (y negativa: cocos2d non ritaglia).
        P('Medal_Sell_Panel', 0, 450, 960, 70, [
            I('Img_Bar', 480, 48, 1136, 111, 'Medal_Syn_DeckBase1.png', s9=False),
            I('Plate_Sort', 667, 45, 185, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Sort_Label', 667, 45, 180, 26, 'Strength', 18),
            L('Txt_Filter_On', 667, 22, 180, 20, 'Filter ON', 14),
            B('Button_Sort', 858, 33, 233, 68, 'But03', 'Sort', 30, opts=BUTS),
            I('Img_Bottom', 480, -402, 1136, 96, 'Medal_Syn_DeckBase2.png', s9=False),
            B('Button', 100, -401, 177, 64, 'But01', 'Sell', 30, label='Txt_Sell', opts=BUT9),
            # riga alta della barra in basso: titolo «Munny» (il valore e' Txt_Money_Total_Lavel)
            L('Txt_Money_Total', 262, -384, 100, 24, 'Munny', 17),
        ]),
        # in alto: contatore come in Medal List, poi i Munny
        # posseduti: Txt_Money (100300003 «Munny») e Txt_Money_Label
        I('Plate_Slots', 118, 495, 218, 26, 'Plate03.png', opts=PLATE3),
        L('Txt_MedalGet', 45, 495, 80, 26, 'Slots', 17),
        L('Txt_MedalGet_Num_Label', 160, 495, 50, 26, '0', 18),
        L('Txt_MedalGet_Slash', 183, 495, 14, 26, '/', 18),
        L('Txt_MedalGet_All_Label', 205, 495, 50, 26, '0', 18),
        L('BoxNow', 165, 455, 60, 30, '0', 20, visible=False),
        L('BoxMaxLabel', 225, 455, 70, 30, '0', 20, visible=False),
        I('DeckBase2', 375, 495, 266, 26, 'Plate03.png', opts=PLATE3),
        L('Txt_Money', 285, 495, 80, 26, 'Munny', 17),
        I('Icon_Money_Top', 349, 495, 56, 57, 'IncentiveIcon_04.png', scale=0.4, s9=False),
        L('Txt_Money_Label', 445, 495, 120, 26, '0', 18),
        # in basso: Munny e Avatar Coins ricavati
        I('Plate_Money_Total', 373, 66, 311, 24, 'Plate03.png', opts=PLATE3),
        I('Icon_Money_Sell', 369, 66, 56, 57, 'IncentiveIcon_04.png', scale=0.4, s9=False),
        L('Txt_Money_Total_Lavel', 480, 66, 110, 24, '0', 18),
        I('Plate_A_Coin', 373, 30, 311, 24, 'Plate03.png', opts=PLATE3),
        L('Txt_A_Coin', 275, 30, 120, 24, 'Avatar Coins', 17),
        I('Icon_A_Coin', 401, 30, 67, 69, 'IncentiveIcon_14.png', scale=0.38, s9=False),
        L('Txt_A_Coin_Label', 495, 30, 80, 24, '0', 18),
        P('Plate_A_Jewel', 700, 51, 200, 28, [
            L('Txt_A_Jewel', 40, 14, 70, 28, '', 18),
            L('Txt_A_Jewel_Label', 140, 14, 100, 28, '0', 20),
        ], visible=False),
        P('Plate_A_Ticket', 700, 14, 200, 28, [
            L('Txt_A_Ticket', 40, 14, 70, 28, '', 18),
            L('Txt_A_Ticket_Label', 140, 14, 100, 28, '0', 20),
        ], visible=False),
    ])),
    # Moogle Shop (schede
    # ): nessun layout esiste nelle risorse. Disposizione dalla 4.1.0 giapponese
    # (reference\moogle_shop\jp410_*.png, youtube FX5Chfckqkk): schede «Traits»/«Items»
    # (tab0/tab1: pulsante img/ui/Mogshop_tab_*, Txt_Tab, Icon_New), «Sell Materials»
    # arancione in alto a destra, finestra con l'elenco (CenterUI > Mshop_win > Area_Traits,
    # Area_Item, win_Traits, win_Item), «Select Medal» e i Munny posseduti in basso, il
    # moogle a destra (Moogle_Fla, lwf/mogshop/mog_wait). Nomi dalle stringhe del codice
    # (func_strings.py) e dal decompilato.
    'MoogleShopScene_ver410.json': ('scene', [('CenterUI', 'publish/MoogleShop_Gen.json'),
                                              ('LeftUI', 'publish/MedalSell_Back.json', 0, 576)]),
    'MoogleShop_Gen.json': ('build', P('moogle_shop_root', 0, 0, 960, 640, [
        # tab1/tab2 («tab%d» da 1; testi 106220402/403) sono ImageView: il pulsante vi carica img/ui/Mogshop_tab_*
        # (da Panel: crash in loadTexture); figli rispetto al centro
        # Misure da reference\moogle_shop\moogle_shop_01.png (area di gioco 1764 px = 1136,
        # scala 1,553): finestra x 2-755, y 4-466; schede ~200x48 a y 492; «Sell Materials»
        # centrato a x 655; righe larghe 720 (720x184 e 720x110)
        I('tab1', 115, 492, 200, 48, 'Plate01.png', s9=False, children=[
            L('Txt_Tab', 0, 0, 190, 40, 'Traits', 24),
            I('Icon_New', 80, 22, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False)]),
        I('tab2', 327, 492, 200, 48, 'Plate01.png', s9=False, children=[
            L('Txt_Tab', 0, 0, 190, 40, 'Items', 24),
            I('Icon_New', 80, 22, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False)]),
        B('Button_EquipSell', 655, 495, 252, 63, 'But03', 'Sell Materials', 26, label='Txt_EquipSell',
          opts=BUTS),
        P('Mshop_win', 2, 4, 754, 462, [
            I('win_Traits', 377, 231, 754, 462, 'Panel04.png', opts=GRID),
            I('win_Item', 377, 231, 754, 462, 'Panel04.png', opts=GRID, visible=False),
            P('Area_Traits', 17, 74, 720, 380),
            P('Area_Item', 17, 10, 720, 444, visible=False)]),
        L('Txt_NoItem', 379, 240, 500, 40, 'No items available.', 24, visible=False),
        B('Button_MedalSelect', 379, 40, 177, 64, 'But01', 'Select Medal', 22, label='Txt_MedalSelect',
          opts=BUTS),
        I('LB_Munnies', 870, 30, 230, 26, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_MunniesPossessed_Label', -70, 0, 100, 24, 'Munny', 17),
            I('Icon_Munnies', -5, 0, 44, 46, 'Icon_Prize.png', s9=False, scale=0.5),
            L('Txt_Munnies', 65, 0, 120, 24, '0', 18)]),
        P('Moogle_Fla', 860, 160, 10, 10),
    ])),
    # Righe dell'elenco (le crea: Traits 721x110, Items 721x184; riempite da
    # ). Nomi dal client; disposizione dalle righe della 4.1.0
    # (riquadro scuro con icona del trait, nome, prezzo a destra; oggetti su targa dorata
    # con «Buy»). Panel_Disable, Caution, LockMask nascosti: li mostra il codice.
    # Ricerche di changeRowKakusei (lookups.py): dentro Panel_Disable cerca
    # Panel, SkillPanel, SkillPanel_Rare (kakusei_Icon, Txt_KakuseiSkill), Count (Txt_Count,
    # Txt_Count_Cus) e Plate_Count_Rare; dalla riga Jewel/Txt_Jewel, Munnies/Txt_Munnies,
    # Caution, Icon_New, Txt_Limit, LockMask (ImageButton_LockMask, Icon_Lock). Aspetto da
    # reference\moogle_shop\moogle_shop_traits_yt_03.jpg: riga blu (dorata per le offerte a
    # tempo), icona tonda del trait e nome su targa scura, prezzo a destra, «Exchanges left»
    # sotto il prezzo, «N day left» in alto a destra.
    'MoogleShop_Traits_Panel_ver410.json': ('build', P('Traits_Root', 0, 0, 721, 110, [
        P('Panel_Disable', 0, 0, 721, 110, [
            # Panel e Panel_Rare sono lo sfondo della riga: ImageView in cui changeRowKakusei
            # carica img/ui/But29_* (blu) o But31_* (dorata) secondo frameType (con un Panel:
            # crash in loadTexture, stack mg8); texture di make_textures.py, 704x106
            I('Panel', 360, 55, 704, 106, 'Plate01.png', s9=False),
            I('Panel_Rare', 360, 55, 704, 106, 'Plate01.png', s9=False, visible=False),
            P('SkillPanel', 18, 20, 440, 70, [
                I('Skill_Base', 230, 35, 420, 56, 'Plate03.png', opts=PLATE3),
                I('kakusei_Icon', 34, 35, 60, 60, 'Plate01.png', s9=False),
                L('Txt_KakuseiSkill', 210, 35, 300, 36, '', 24)]),
            P('SkillPanel_Rare', 18, 20, 440, 70, [
                I('Skill_Base2', 230, 35, 420, 56, 'Plate03.png', opts=PLATE3),
                I('kakusei_Icon', 34, 35, 60, 60, 'Plate01.png', s9=False),
                L('Txt_KakuseiSkill', 210, 35, 300, 36, '', 24)], visible=False),
            # solo Txt_Count: il codice ne fa un CustomRichText «Txt_Count_Cus»;
            # una Label con quel nome verrebbe presa al suo posto (crash)
            P('Count', 480, 6, 220, 26, [
                L('Txt_Count', 110, 13, 210, 22, '', 16)], visible=False),
            # frameType 1: SkillPanel + Count; altrimenti SkillPanel_Rare + «Count_Rare»
            # (stringa Plate_Count_Rare + 6; crash), con gli stessi testi
            P('Count_Rare', 480, 6, 220, 26, [
                I('Plate_Count_Rare', 110, 13, 220, 26, 'Plate03.png',
                  opts=dict(PLATE3, colorR=255, colorG=220, colorB=90)),
                L('Txt_Count', 110, 13, 210, 22, '', 16)], visible=False)]),
        P('Jewel', 480, 34, 220, 50, [
            I('Jewel_Icon', 30, 25, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.45),
            L('Txt_Jewel', 140, 25, 150, 34, '0', 26)]),
        P('Munnies', 480, 34, 220, 50, [
            I('Munnies_Icon', 30, 25, 44, 46, 'Icon_Prize.png', s9=False, scale=0.6),
            L('Txt_Munnies', 140, 25, 150, 34, '0', 24)], visible=False),
        P('Caution', 30, 0, 440, 20, [L('Txt_Caution', 220, 10, 430, 20, '', 16)], visible=False),
        I('Icon_New', 40, 98, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False),
        L('Txt_Limit', 620, 96, 180, 20, '', 16),
        P('LockMask', 0, 0, 721, 110, [
            B('ImageButton_LockMask', 360, 55, 721, 110, 'But16', None),
            I('Icon_Lock', 650, 55, 45, 49, 'Deck_Medal_Lock.png', s9=False)], visible=False)])),
    # Ricerche di changeRowItem (lookups.py sul client): dalla riga Item
    # (testi Txt_Material_Name/_Text), Panel e Panel_Rare (uno solo visibile secondo frameType;
    # Panel_Item dentro quello scelto), But_Buy con dentro ImageButton_Buy1, Count con
    # Plate_Count, Plate_Count_Rare, Txt_Count, Txt_Count_Cus; Jewel/Txt_Jewel, Caution,
    # Icon_New, Txt_Limit, LockMask (ImageButton_LockMask, Lock_icon). Testi e pulsanti fuori
    # da Panel/Panel_Rare (la ricerca prende il primo trovato, anche se nascosto). Aspetto da
    # reference\moogle_shop\moogle_shop_01.png: riga blu, icona a sinistra, nome su targa,
    # prezzo in jewel e «Exchange» rosso a destra.
    'MoogleShop_Item_Panel.json': ('build', P('Item_Root', 0, 0, 721, 184, [P('Item', 0, 0, 721, 184, [
        P('Panel', 0, 0, 721, 184, [
            # Win04 e' alta 322 e il 9-slice non scende sotto: altezza 322 scalata a 176 (senza,
            # lo sfondo di ogni riga copre la meta' bassa della precedente)
            I('Row_Base', 360, 92, 704, 322, 'Win04.png', opts=dict(PANEL4, capInsetsY=60, scaleY=0.547)),
            P('Panel_Item', 22, 22, 140, 140)]),
        P('Panel_Rare', 0, 0, 721, 184, [
            I('Row_Base_Rare', 360, 92, 704, 322, 'Win04.png',
              opts=dict(PANEL4, capInsetsY=60, scaleY=0.547, colorR=255, colorG=170, colorB=40)),
            P('Panel_Item', 22, 22, 140, 140)], visible=False),
        I('Name_Plate', 440, 140, 520, 44, 'Plate03.png', opts=PLATE3),
        L('Txt_Material_Name', 330, 140, 300, 36, '', 24),
        L('Txt_Material_Text', 360, 92, 360, 40, '', 18),
        P('Jewel', 520, 118, 190, 44, [
            I('Jewel_Icon', 28, 22, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.45),
            L('Txt_Jewel', 130, 22, 150, 34, '0', 26)]),
        B('But_Buy', 612, 62, 177, 64, 'But01', 'Exchange', 24, label='Txt_buy', opts=BUTS, children=[
            B('ImageButton_Buy1', 0, 0, 177, 64, 'But01', None, opts=BUTS, visible=False)]),
        P('Count', 190, 8, 300, 30, [
            I('Plate_Count', 150, 15, 300, 26, 'Plate03.png', opts=PLATE3, visible=False),
            I('Plate_Count_Rare', 150, 15, 300, 26, 'Plate03.png',
              opts=dict(PLATE3, colorR=255, colorG=200, colorB=60), visible=False),
            L('Txt_Count', 150, 15, 280, 22, '', 16)], visible=False),   # _Cus: lo crea il codice
        L('Txt_Limit', 612, 16, 200, 22, '', 16),
        P('Caution', 180, 160, 360, 24, [L('Txt_Caution', 180, 12, 360, 20, '', 16)], visible=False),
        I('Icon_New', 40, 165, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False),
        P('LockMask', 0, 0, 721, 184, [
            B('ImageButton_LockMask', 360, 92, 721, 184, 'But16', None),
            I('Lock_icon', 650, 92, 45, 49, 'Deck_Medal_Lock.png', s9=False)], visible=False)])])),
    # IconPanel: dentro Panel_Item; Base riceve img/ui/Mogshop_plate1.png (make_textures.py)
    # (icona generica di un premio: tipo, id, nome, quantita') vi cerca e usa
    # senza controlli LuxBoard, AVT, Incentive, Medal, KB, Stamp (Star_Area facoltativo); li
    # nasconde e mostra quello del tipo (3 medaglia, 5 materiale e gli altri -> Incentive).
    # Struttura come i premi di AdventureTop2_SubMission_ver131 (Incentive, Medal, KB, LuxBoard,
    # AVT); senza: crash all'apertura della scheda Items
    'MoogleShop_IconPanel.json': ('build', P('IconPanel', 0, 0, 140, 140, [
        # Base: il codice vi carica img/ui/Mogshop_plate1 solo per Panel_Rare; stessa texture
        # anche in cocostudio/publish per la riga normale (make_textures.py)
        I('Base', 70, 70, 140, 140, 'Mogshop_plate1.png', s9=False),
        I('Incentive', 70, 70, 100, 100, 'Plate01.png', s9=False, visible=False),
        I('Medal', 70, 70, 89, 109, 'Medal_S_00000001.png', s9=False, visible=False),
        I('KB', 70, 70, 100, 100, 'Plate01.png', s9=False, visible=False),
        I('Stamp', 70, 70, 100, 100, 'Plate01.png', s9=False, visible=False),
        P('LuxBoard', 20, 20, 100, 100, visible=False),
        P('AVT', 20, 20, 100, 100, visible=False),
        P('Star_Area', 20, 5, 100, 24, visible=False),
        # changeRowItem cerca Icon_Skill dentro Panel_Item (l'icona dell'abilita' delle
        # medaglie con skillType 3) e ne chiama setVisible senza controlli
        I('Icon_Skill', 115, 115, 40, 40, 'Plate01.png', s9=False, visible=False)])),
    # Vendita materiali («Sell Materials» del Moogle Shop): EquipSellScene e i
    # suoi layout non esistono. Nessuno screenshot originale trovato: stile della vendita
    # medaglie. Scena: Button_Back, Txt_Money_Total(_Lavel), EquipSell_Scroll_Area, Txt_None.
    # Riga EquipSell_Block (riempita): EquipSellBlock con
    # MaterialSellIcon, «Txt_data1 » (con lo spazio in coda), Txt_data2, Txt_Material_Name,
    # Txt_MaterialStock_Fix1, Txt_Money_Fix, PanelMask.
    'EquipSellScene.json': ('scene', [('CenterUI', 'publish/EquipSell_Gen.json'),
                                      ('LeftUI', 'publish/MedalSell_Back.json', 0, 576)]),
    # radice «Panel_1»: il codice cerca Panel_1 e dentro EquipSell_Scroll_Area
    'EquipSell_Gen.json': ('build', P('Panel_1', 0, 0, 960, 640, [
        I('Grid_Under', 480, 280, 950, 380, 'Panel04.png', opts=GRID),
        P('EquipSell_Scroll_Area', 9, 95, 942, 370),
        L('Txt_None', 480, 280, 600, 40, '', 24),
        I('Img_Bottom', 480, 48, 1136, 96, 'Medal_Syn_DeckBase2.png', s9=False),
        I('Plate_Money_Total', 480, 45, 400, 30, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_Money_Total', -110, 0, 140, 26, 'Munny', 20),
            I('Icon_Money_Total', -20, 0, 44, 46, 'Icon_Prize.png', s9=False, scale=0.5),
            L('Txt_Money_Total_Lavel', 100, 0, 160, 26, '0', 22)])])),
    # Le colonne stanno a meta' della larghezza dell'area (~465): riga larga 460, come le
    # targhe della vendita medaglie: nome in alto, «Owned» con la quantita' (Txt_data1 ha il
    # testo 102000002 = " "), «Price» (Txt_data2) con l'icona dei Munny e il prezzo in giallo.
    'EquipSell_Block.json': ('build', P('Panel_Block', 0, 0, 460, 110, [
        P('EquipSellBlock', 0, 0, 460, 110, [
            I('Block_Base', 230, 55, 450, 104, 'Plate02.png', opts=PANEL4),
            I('MaterialSellIcon', 62, 55, 80, 80, 'Plate01.png', s9=False),
            L('Txt_Material_Name', 280, 84, 300, 28, '', 22),
            I('Own_Plate', 285, 50, 300, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Own', 185, 50, 100, 24, 'Owned', 18),
            L('Txt_data1 ', 300, 50, 20, 24, '', 18),
            L('Txt_MaterialStock_Fix1', 370, 50, 120, 24, '', 20),
            I('Price_Plate', 285, 20, 300, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_data2', 185, 20, 100, 24, '', 18),
            I('Icon_Price', 260, 20, 44, 46, 'Icon_Prize.png', s9=False, scale=0.45),
            L('Txt_Money_Fix', 370, 20, 120, 24, '', 20, opts=dict(colorR=255, colorG=230, colorB=60)),
            P('PanelMask', 0, 0, 460, 110, visible=False),
            # Panel_On: evidenza della riga scelta (cercato, crash se manca)
            I('Panel_On', 230, 55, 450, 104, 'Plate02.png', opts=dict(PANEL4, colorR=120, colorG=220, colorB=255),
              visible=False)])])),
    'EquipSell_Dialog_Step1.json': ('func', 'material_sell_popup'),
    # Conferma: popup OK/Annulla con il riepilogo
    'EquipSell_Dialog_Step2.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                    {'Button_OK': 'Button_sell_ok', 'Txt_OK': 'Txt_sell_ok',
                                     'Button_Close': 'Button_cancel', 'Txt_Cancel': 'Txt_cancel',
                                     '4Line_Label': 'Txt_Material_Name_Dlog'},
                                    False, [
        ('text', 'Txt_Material_Name_Dlog', ''),
        L('Txt_data1', 380, 300, 200, 26, '', 20), L('Txt_data2', 580, 300, 200, 26, '', 20),
        L('Txt_data3', 480, 260, 300, 26, '', 20),
        L('Txt_MoneyTotalStock_Fix2', 380, 260, 150, 26, '', 20)]),
    # Quantita' da vendere di una medaglia impilata (equip_sell_popup, piu' sotto).
    'EquipSell_Medal_Step1_ver131.json': ('func', 'equip_sell_popup'),
    # Conferma della vendita: dal popup generico OK/Annulla originale.
    # Button_Sell/Txt_Sell (100100029), Button_Close/Txt_Cancel, Alert_Area (vi aggiunge un
    # PopupNormal_MedalMix_RareCaution_Panel per ogni avviso: Txt_Wording1, Star1, ...).
    'PopupNormal_MedalSell_Check_ver350.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                                {'Button_OK': 'Button_Sell', 'Txt_OK': 'Txt_Sell'}, False, [
        ('text', '4Line_Label', ''),    # la domanda la scrive il codice in Txt_Sell
        # targhe come il popup «Complete!» (obtain_plates): con obtain_panels l'icona dei Munny
        # finiva schiacciata (9-slice 30x30) e lontana dal testo (banco v33)
        # larga quanto PopupNormal_MedalMix_RareCaution_Panel (600, x = 0 dal codice), centrata
        P('Alert_Area', 180, 255, 600, 40)] + obtain_plates(480, 420)),
    # Avviso «materiali rari» del Level Up (anche): senza il file
    # GUIReader restituisce un widget nullo e il client va in crash al tocco di Level Up.
    # Cerca NormalText_Window03, Button_OK/Txt_OK, Button_Close/Txt_Cancel, Txt_Wording3
    # (messaggio, testo 101399491) e Alert_Area (un _Panel per ogni avviso).
    # Il codice mette ogni _Panel in Alert_Area con x = 0 e y centrata (solo setPositionY):
    # Alert_Area larga quanto il pannello (600) e centrata sulla finestra (x 180..780), se no la
    # riga «Includes ★ Medals or higher.» usciva a destra dalla finestra (banco 12-10). Finestra
    # alta 380 per stare sopra i pulsanti anche con 3 avvisi (y 250..370).
    'PopupNormal_MedalMix_RareCaution.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                              {'NormalText_Window01': 'NormalText_Window03',
                                               '4Line_Label': 'Txt_Wording3'}, False, [
        ('text', 'Txt_Wording3', ''),
        ('opts', 'NormalText_Window03', dict(height=380, scale9Height=380, scale9Enable=True, capInsetsX=50,
                                             capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        ('opts', 'Txt_Wording3', dict(y=110, height=90, areaHeight=90)),
        ('opts', 'Button_OK', dict(y=-134)),
        ('opts', 'Button_Close', dict(y=-134)),
        P('Alert_Area', 180, 290, 600, 40)]),
    # Riga di un avviso (Level Up vendita): caso 1 = Txt_Wording1
    # (101400008 «Includes»), Star1, Txt_Wording2 (101400009 «Medals or higher.»); casi 2-5 =
    # solo Txt_Wording3. Il codice non sposta i figli: «Includes» allineato a destra e la frase
    # a sinistra attorno alle stelle, la riga resta compatta al centro (x 300). Il caso 1 scatta
    # con rarita' > 2 (della medaglia, flag), come la fascia
    # della vendita: tre stelle, le altre due figlie di Star1 (il codice ne cambia solo la
    # visibilita'; figli di un ImageView rispetto al centro).
    'PopupNormal_MedalMix_RareCaution_Panel.json': ('build', P('Panel_Caution', 0, 0, 600, 40, [
        L('Txt_Wording1', 125, 20, 160, 36, 'Includes', 22, opts=dict(hAlignment=2)),
        I('Star1', 250, 20, 26, 26, 'rare_star.png', s9=False, children=[
            I('Star1_L', -28, 0, 26, 26, 'rare_star.png', s9=False),
            I('Star1_R', 28, 0, 26, 26, 'rare_star.png', s9=False)]),
        L('Txt_Wording2', 426, 20, 260, 36, 'Medals or higher.', 22, opts=dict(hAlignment=0)),
        L('Txt_Wording3', 300, 20, 580, 36, '', 22, visible=False)])),
    # Rilancio della guilt nel Level Up (copia su una medaglia con la guilt gia'
    # sbloccata; senza file crash al tocco di Level Up). Cerca dalla radice Win, Button_OK > Txt_OK
    # (100100001), Button_Close > Txt_Cancel (100100002); in Win: Txt_Wording1 (CustomRichText
    # Txt_Wording1_custom creato dal codice: 101300035 «Attempt to raise special attack bonus\nfrom
    # +%d%%?»), Txt_Wording2 (_custom: 101300036 «Bonus range: +%d - %d%%», solo se l'intervallo
    # normale e quello della campagna coincidono), Dummy, Dummy_Announce > Txt_Announce (101300056
    # «New bonus range», lampeggia), Txt_Wording3 (101300037); in Dummy: Txt_Wording4 (101300054
    # «Bonus range:»), Txt_Wording5 e Txt_Wording6 (101300055 «+%d - %d%%», intervallo normale ->
    # campagna), Syn_Arrow02. Tutti usati senza controlli. Nessuno screenshot originale trovato:
    # stile del popup OK/Annulla originale, una riga per testo.
    'PopupNormal_Guilt_ver130.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                      {'NormalText_Window01': 'Win', '4Line_Label': 'Txt_Wording1'}, False, [
        ('text', 'Txt_Wording1', ''),
        ('opts', 'Win', dict(height=400, scale9Height=400, scale9Enable=True, capInsetsX=50, capInsetsY=60,
                             capInsetsWidth=1, capInsetsHeight=200)),
        ('opts', 'Txt_Wording1', dict(y=128, height=80, areaHeight=80)),
        ('opts', 'Button_OK', dict(y=-140)),
        ('opts', 'Button_Close', dict(y=-140)),
        ('add', 'Win', L('Txt_Wording2', 0, 60, 600, 36, '', 24, opts=dict(hAlignment=1, vAlignment=1))),
        # riga «Bonus range: +40 - 100% -> +70 - 100%» (Panel: figli dall'angolo in basso a sinistra)
        ('add', 'Win', P('Dummy', -300, 42, 600, 36, [
            L('Txt_Wording4', 145, 18, 180, 36, '', 24, opts=dict(hAlignment=2, vAlignment=1)),
            L('Txt_Wording5', 302, 18, 124, 36, '', 24, opts=dict(hAlignment=1, vAlignment=1)),
            # freccia del dettaglio medaglia (MedalInfo_Arrow01, 56x134, punta a sinistra):
            # girata verso destra e rimpicciolita
            I('Syn_Arrow02', 378, 18, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.25, flipX=True),
            L('Txt_Wording6', 458, 18, 136, 36, '', 24, opts=dict(hAlignment=1, vAlignment=1))])),
        # «New bonus range» sotto l'intervallo nuovo (Txt_Wording6, x 158)
        ('add', 'Win', I('Dummy_Announce', 158, 12, 220, 28, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_Announce', 0, 0, 210, 26, '', 20,
              opts=dict(hAlignment=1, vAlignment=1, colorR=255, colorG=230, colorB=60))])),
        ('add', 'Win', L('Txt_Wording3', 0, -55, 600, 36, '', 22, opts=dict(hAlignment=1, vAlignment=1)))]),
    # Optimize del Level Up (Button_MaxEnhanced):
    # il layout non esiste in nessuna risorsa; senza, GUIReader legge «widgetTree» da un documento
    # vuoto e il client va in crash al tocco
    # (I-090, banco 12-10). Cerca dalla radice: Scroll_Area (coda di EquipSell_Scroll_Area: vi
    # aggiunge MaxEnhanceMedalScrollView, i materiali scelti), Txt_Title (106220300), Txt_attention
    # (106220301), Base_Money1/Base_Money2 > Txt_Money (100300002/3) e Txt_Money_Label (costo e
    # Munny posseduti), Button_Mix (vi aggiunge il pulsante But01) >
    # Txt_Mix (106220314 «Level Up»), Announce (facoltativo), Close_Button; per ogni parametro
    # MaxLv/MaxAtk/MaxDef/MaxCost/MaxGuilt: CheckBox_<p> (CheckBox vero: setSelected/isSelected),
    # Plate_Max (lampeggia; nascosta e mostrata), Txt_<p> (testo 106220304/
    # 306/308/310/312) e Txt_<p>_Label (valore, con ombra crash se manca). Nessuno
    # screenshot originale trovato (reference\optimize: solo testi): finestra Win04 dei popup,
    # targhe Munny e pulsante Level Up come MedalInfo_Mix_ver340, filtri But16 del popup Sort.
    'MedalInfo_MaxEnhanced_ver340.json': ('build', P('Panel_MaxEnhanced', 0, 0, 960, 640, [
        I('Win', 480, 320, 840, 600, 'Win04.png',
          opts=dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        L('Txt_Title', 480, 578, 760, 34, 'Choose a parameter to max out.', 26, opts=dict(hAlignment=1)),
        *[P(p, 80, y, 420, 60, [
            I('Plate_Max', 330, 30, 170, 40, 'Plate03.png', visible=False,
              opts=dict(PLATE3, colorR=255, colorG=220, colorB=90)),
            C('CheckBox_' + p, 115, 30, 218, 52, 'But16'),
            L('Txt_' + p, 115, 30, 200, 40, t, 22, opts=dict(hAlignment=1, vAlignment=1)),
            L('Txt_' + p + '_Label', 330, 30, 170, 36, '', 24, opts=dict(hAlignment=1, vAlignment=1))])
          for p, t, y in (('MaxLv', 'LV', 480), ('MaxAtk', 'Max STR', 410), ('MaxDef', 'Max DEF', 340),
                          ('MaxCost', 'Cost', 270), ('MaxGuilt', 'SP Attack Bonus', 200))],
        I('Grid_Under', 700, 375, 360, 330, 'Panel04.png', opts=GRID),
        P('Scroll_Area', 525, 215, 350, 320),
        L('Txt_attention', 480, 168, 780, 30, '', 18, opts=dict(hAlignment=1)),
        I('Base_Money1', 300, 118, 300, 26, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_Money', -110, 0, 100, 24, 'Cost', 18),
            I('Icon_Money', -25, 0, 44, 46, 'Icon_Prize.png', s9=False, scale=0.5),
            L('Txt_Money_Label', 80, 0, 160, 24, '0', 20)]),
        I('Base_Money2', 300, 86, 300, 26, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_Money', -110, 0, 100, 24, 'Held', 18),
            I('Icon_Money', -25, 0, 44, 46, 'Icon_Prize.png', s9=False, scale=0.5),
            L('Txt_Money_Label', 80, 0, 160, 24, '0', 20)]),
        I('Button_Mix', 660, 102, 158, 68, 'But01_Off.png', s9=False, children=[
            L('Txt_Mix', 0, 3, 152, 58, 'Level Up', 26, opts=dict(hAlignment=1, vAlignment=1))]),
        B('Close_Button', 884, 604, 64, 64, 'But_Close', None)])),
    # Conferma dello scambio di un articolo del Moogle Shop (openItemBuyPopup;
    # senza file crash): Txt_Wording (domanda), Txt_CrownPossessed_Label/Txt_CrownPossessed (jewel
    # posseduti), LB_Munnies con Txt_MunniesPossessed_Label/Txt_Munnies, Button_OK/Txt_OK,
    # Button_Close/Txt_Cancel. Dal popup OK/Annulla originale.
    # Anche conferma del trait, che cerca in piu' LB_Jewel (targa dei jewel,
    # visibile con payType 1 come Txt_CrownPossessed/_Label).
    'MoogleShop_Traits_AddCheck.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                        {'4Line_Label': 'Txt_Wording'}, False,
                                        [('text', 'Txt_Wording', ''), ('opts', 'Txt_Wording', dict(y=75, height=100))]
                                        + held_plates(300)),
    # Conferma del trait su una medaglia senza slot liberi (con lo slot da
    # sostituire scelto nel popup): come AddCheck, ma l'OK si chiama Button_Draw (etichetta
    # Txt_Draw: con Txt_OK crash al tocco di «Set Trait», banco ts10) e sopra il
    # costo c'e' Txt_Wording2 (testo 106220410 «Replace X with Y?», CustomRichText creato dal
    # codice, come Txt_Wording).
    'MoogleShop_Traits_OverwriteCheck_ver410.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                                     {'4Line_Label': 'Txt_Wording', 'Button_OK': 'Button_Draw',
                                                      'Txt_OK': 'Txt_Draw'},
                                                     False,
                                                     [('text', 'Txt_Wording', ''),
                                                      ('opts', 'Txt_Wording', dict(y=30, height=50)),
                                                      L('Txt_Wording2', 480, 430, 600, 70, '', 22)]
                                                     + held_plates(290)),
    # Avatar Boards, «Unlock All»: Txt_Wording (domanda, anche Xml_Txt_Wording),
    # Txt_BondsPossessed/_Label (monete possedute), Coin_Icon, Button_OK/Txt_OK,
    # Button_Close/Txt_Cancel. Come le conferme del Moogle Shop (dal popup OK/Annulla originale)
    'PopupNormal_SphereCoinCheck_ver310.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                                {'4Line_Label': 'Txt_Wording'}, False,
                                                [('text', 'Txt_Wording', ''), ('opts', 'Txt_Wording', dict(y=75, height=100)),
                                                 L('Xml_Txt_Wording', 480, 395, 600, 100, '', 22, visible=False),
                                                 I('LB_Coin', 480, 300, 360, 28, 'Plate03.png', opts=PLATE3, children=[
                                                     I('Coin_Icon', 15, 0, 90, 90, 'IncentiveIcon_14.png', s9=False,
                                                       scale=0.3)]),
                                                 L('Txt_BondsPossessed', 400, 300, 160, 28, 'Held', 22),
                                                 L('Txt_BondsPossessed_Label', 570, 300, 200, 28, '0', 22)]),
    # popup del nodo sbloccato (lo carica lo centra e cerca
    # Txt_Get_Label, Panel, Button_Ok/Txt_Ok): dal popup OK originale. Nel suo Panel il codice
    # aggiunge Sphere_Incentive_ver240 (solo l'icona del premio, riempita):
    # come popup completo appariva una seconda finestra spostata di Panel (banco v32_unlock4a).
    # Txt_Get_Label a y 45: sotto la scritta CONGRATULATIONS (LWF in Area_Point; a y 78 la
    # copriva, banco q9_get) e sopra l'icona (Panel y 250)
    # Geometria dall'originale JP (Sphere_Popup_Get_ver240: finestra LB_Reward_Win 750x513
    # al centro, Panel a +46, Txt_Get_Label a -146, Area_Point a y 514, nessun OK). LB_Reward_Win
    # e' la finestra arancione ad arco: qui Result_Reward_Win, servita, come Sphere_Popup_Comp.
    # Con l'icona del premio JP (150x150, centrata sull'origine di Panel) nella finestra Win04 di
    # prima l'icona copriva OK (banco 14-10, d15_unl_late). OK resta (il codice WW lo usa) in fondo.
    'Sphere_Popup_Get_ver240.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                                     {'4Line_Label': 'Txt_Get_Label', 'Button_OK': 'Button_Ok', 'Txt_OK': 'Txt_Ok'},
                                     False, [('text', 'Txt_Get_Label', ''),
                                             ('tex', 'NormalText_Window01', 'Result_Reward_Win.png',
                                              dict(scale9Enable=True, capInsetsX=40, capInsetsY=110,
                                                   capInsetsWidth=1, capInsetsHeight=1)),
                                             ('opts', 'NormalText_Window01', dict(y=320, width=750, height=513,
                                                                                   scale9Width=750, scale9Height=513)),
                                             # figli dell'ImageView: coordinate dal centro (480, 320)
                                             ('opts', 'Txt_Get_Label', dict(y=-118, width=600, height=60)),
                                             ('opts', 'Button_Ok', dict(y=-198)),
                                             P('Panel', 480, 366, 100, 100),
                                             P('Area_Point', 480, 514, 10, 10)]),
    'Sphere_Incentive_ver240.json': ('build', P('Sphere_Incentive_ver240', 0, 0, 100, 100, reward_icons(50, 50))),
    # ultimo nodo, bacheca completata: carica questo layout, cerca Txt_All
    # (testo 106180205 «You completed the board!», visibile solo con il flag) e poi
    # chiama come per Sphere_Popup_Get: servono anche Txt_Get_Label, Panel e
    # Button_Ok/Txt_Ok (senza, crash al tocco di OK sull'ultimo nodo, banco q10_done).
    # Area_Point (LWF SphereMap_Complete e Result_Reward). Una riga in piu'
    # del Get: finestra allungata in basso (in alto resta a y 481), OK e icona piu' bassi;
    # capInsetsY 60: con 0 (originale) si stirava la fascia chiara in cima (banco s3_comp)
    # Aspetto da ab_ref_title_popup_01 (1080p: x = (x'-150)/1,6875, y = 640 - y'/1,6875): cornice
    # arancione a strisce con l'arco (Result_Reward_Win, nessun layout originale la usa piu'),
    # fondo marrone #3A2410, targa del titolo in alto (Panel), «You got a new title!» in un
    # riquadro arancione con il bordo giallo, OK sul bordo in basso; CONGRATULATIONS (LWF in
    # Area_Point) sull'arco. Txt_All (solo con «Unlock All») tra la targa e il riquadro
    'Sphere_Popup_Comp_ver310.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                                      {'4Line_Label': 'Txt_Get_Label', 'Button_OK': 'Button_Ok', 'Txt_OK': 'Txt_Ok'},
                                      False, [('text', 'Txt_Get_Label', ''),
                                              ('tex', 'NormalText_Window01', 'Result_Reward_Win.png',
                                               dict(scale9Enable=True, capInsetsX=40, capInsetsY=110,
                                                    capInsetsWidth=1, capInsetsHeight=1)),
                                              ('opts', 'NormalText_Window01', dict(y=324, width=746, height=595,
                                                                                    scale9Width=746, scale9Height=595)),
                                              # figli dell'ImageView: coordinate dal centro (480, 324)
                                              ('add', 'NormalText_Window01', P('Comp_Brown', -348, -225, 696, 401,
                                                                               opts=dict(colorType=1, bgColorR=58, bgColorG=36,
                                                                                         bgColorB=16, bgColorOpacity=255, ZOrder=1))),
                                              ('add', 'NormalText_Window01', P('Comp_Box_Rim', -313, -190, 626, 136,
                                                                               opts=dict(colorType=1, bgColorR=255, bgColorG=205,
                                                                                         bgColorB=45, bgColorOpacity=255, ZOrder=2))),
                                              ('add', 'NormalText_Window01', P('Comp_Box', -310, -187, 620, 130,
                                                                               opts=dict(colorType=1, bgColorR=250, bgColorG=145,
                                                                                         bgColorB=30, bgColorOpacity=255, ZOrder=3))),
                                              ('opts', 'Txt_Get_Label', dict(y=-122, width=600, height=60, ZOrder=4)),
                                              ('opts', 'Button_Ok', dict(y=-260, ZOrder=4)),
                                              # targa del titolo JP (Sphere_Incentive_ver240, centrata sull'origine di Panel)
                                              # sopra Txt_All: a 430/329 copriva «You completed the board!» (banco 14-10)
                                              L('Txt_All', 480, 290, 600, 34, '', 22),
                                              P('Panel', 480, 372, 100, 100),
                                              # niente scritta fissa sull'arco: la LWF originale SphereMap_Complete
                                              # (import_jp_coco, JP_LWF) disegna «COMPLETE» in Area_Point; con la
                                              # vecchia CONGRATULATIONS fissa si leggeva «C oCOMPLETions!» (banco 14-10)
                                              P('Area_Point', 480, 550, 10, 10)]),
    # Bacheca sbloccata dal level up (dopo «Level Up!» nei risultati e alla home;
    # specifica in stage_gen\lb_popup\REPORT.md). Cerca (ricorsivo dalla radice):
    # Txt (Label, «Unlocked an Avatar Board!» 103400060 e varianti per tipo di bacheca),
    # Select_Base/Select_Board/Select_Kind (ImageView: costume img/sphere_incentive/%d, sfondo
    # img/sphere_board/Board_%04d, genere img/sphere_kind/Kind_%04d), Txt_Title_Label (Label,
    # nome della bacheca), Button_Ok (Button) con Txt_OK (Label, 100100001 «OK») e, finita
    # l'apertura, Area_Point (Panel: vi aggiunge la LWF Result_Reward).
    # Senza il layout: crash in GUIReader. Dal popup OK originale, carta come
    # SphereBoard_Select_Icon_ver130 (Select_Board sotto Select_Base)
    'BattleResult_LB_ver120.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                                    {'4Line_Label': 'Txt', 'Button_OK': 'Button_Ok'}, False, [
        ('text', 'Txt', ''),
        ('opts', 'NormalText_Window01', dict(y=320, height=480, scale9Height=480, scale9Enable=True, capInsetsX=50,
                                             capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        ('opts', 'Txt', dict(y=195, height=44, areaHeight=44, fontSize=28, hAlignment=1, vAlignment=1)),
        ('opts', 'Button_Ok', dict(y=-188)),
        # figli dell'ImageView: coordinate dal centro della finestra
        ('add', 'NormalText_Window01', I('Select_Board', 0, 40, 306, 306, 'Board_0001.png', s9=False, scale=0.62)),
        ('add', 'NormalText_Window01', I('Select_Base', 0, 40, 306, 306, 'Board_0001.png', s9=False, scale=0.62)),
        ('add', 'NormalText_Window01', I('Select_Kind', 0, 40, 306, 306, 'Kind_0001.png', s9=False, scale=0.62)),
        ('add', 'NormalText_Window01', I('Title_Plate', 0, -105, 420, 36, 'Plate03.png', opts=PLATE3)),
        ('add', 'NormalText_Window01', L('Txt_Title_Label', 0, -105, 400, 32, '', 24)),
        P('Area_Point', 480, 560, 10, 10)]),
    # Keyblade ottenuto nei risultati (quando la
    # lista dei premi ha voci di tipo 13 = keyblade): premio di
    # prima conclusione (clearGetItemType 13: stage 1110 «The Mine Pt. 2» -> Treasure Trove 2000,
    # 1210, 1310) o delle missioni. Cerca: Txt (Label, nome del keyblade), KB (ImageView, il
    # codice vi carica l'immagine), Panel (Panel), Txt_Title_Label (101910002 «Set Medals in your
    # new Keyblade!»), Txt_KB_Label (103010011 «Quest Completion Reward» / 103010012 / 103010001
    # / 103010002), Button_Ok con Txt_OK (100100001) e, aperto il popup,
    # Area_Point (LWF Result_Reward). Stessa famiglia di BattleResult_LB_ver120: stessa finestra.
    'BattleResult_KB.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                             {'4Line_Label': 'Txt_KB_Label', 'Button_OK': 'Button_Ok'}, False, [
        ('text', 'Txt_KB_Label', ''),
        ('opts', 'NormalText_Window01', dict(y=320, height=480, scale9Height=480, scale9Enable=True, capInsetsX=50,
                                             capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        ('opts', 'Txt_KB_Label', dict(y=195, height=44, areaHeight=44, fontSize=28, hAlignment=1, vAlignment=1)),
        ('opts', 'Button_Ok', dict(y=-188)),
        # figli dell'ImageView: coordinate dal centro della finestra
        # immagine del keyblade 440x340 come KB di BattleResult_GetItem_ver131 (li' scala 0,35)
        ('add', 'NormalText_Window01', I('KB', 0, 60, 440, 340, 'Deck_KeyBlade_0701_05.png', s9=False, scale=0.55)),
        ('add', 'NormalText_Window01', I('Name_Plate', 0, -62, 420, 36, 'Plate03.png', opts=PLATE3)),
        ('add', 'NormalText_Window01', L('Txt', 0, -62, 400, 32, '', 24)),
        ('add', 'NormalText_Window01', L('Txt_Title_Label', 0, -115, 600, 60, '', 22,
                                         opts=dict(hAlignment=1, vAlignment=1))),
        # Panel: il codice ne cambia solo una proprieta'; trasparente, sotto la finestra
        ('add', 'Panel_8', P('Panel', 0, 0, 10, 10)),
        P('Area_Point', 480, 560, 10, 10)]),
    # Riga «abilita' salita di livello» nei risultati (in ogni
    # scena dei risultati: normale, raid, Colosseo, ...): per ogni medaglia del deck
    # la cui abilita' (userSkills, al massimo 2) ha un livello piu' alto dopo la quest
    # . Il codice la aggiunge a Scroll_Area della scena dei risultati e cerca solo
    # Txt_GetItem_Label (100451005 «%s's %s leveled up!»). Dalla riga sorella originale
    # BattleResult_GetItem_ver131 (targa Result_GetItem_Panel), tolte icone e quantita'.
    'BattleResult_Skill_ver130.json': ('copy', 'BattleResult_GetItem_ver131.json', {}, False, [
        ('text', 'Txt_GetItem_Label', ''),
        ('opts', 'Txt_GetItem_Label', dict(x=-310, width=620, areaWidth=620)),
        ('text', 'Txt_GetItem_Num_Label', ''),
        ('text', 'Txt_Wording', '')] + [('opts', n, dict(visible=False)) for n in (
            'UnderPanel', 'Txt_GetItem_Num_Label', 'New', 'GetItem', 'KB', 'LuxBoard', 'AVT', 'Base')]),
    # Scheda «Events» dell'elenco Story (sbloccata dopo la Quest 14; crea
    #; risposta GET /stage/event).
    # carica il modello di una cella (800x172) e prende la texture di Image_3
    # (renderer, texture): Image_3 deve essere un ImageView SENZA 9-slice
    # con una texture servita, altrimenti crash anche senza eventi. Per ogni evento la cella
    # (clone) cerca: Mask e Icon_Lock (visibili se
    # isLock 1; Icon_Lock carica img/ui/QuestBut_Lock o ShopBut_Lock_Disable), Icon_Complete
    # (img/ui/Complete_icon1/2 secondo complete), Image_3 (il banner scaricato da bannerUrl,
    # ), ImageButton_Check (facoltativo: senza, il codice crea un ImageButton
    # trasparente sopra Image_3), Plate con Txt_Limit (scadenza, se < 100 giorni), Plate_Unlock
    # con Txt_Unlock (102900040 «Available»), EV_DetailButton (contenitore: il codice vi aggiunge un
    # ImageButton But15 e toglie EV_DetailButton_Draw se c'e'), Txt_EV_Detail (102900044 «Details»),
    # Panel_Eff (facoltativo). Senza eventi: Txt_NoEvent di AdventureTop2_EV_Banner_Area_ver120
    # (102900026 «No available events.»). Stile: banner Event_Banner1 (640x140, come in
    # AdventureTop2_EV_Title_ver103) con la targa Plate09 della scadenza (AdventureTop2_EV_Lock_ver130).
    'AdventureTop2_EV_Banner_ver220.json': ('build', P('EV_Banner', 0, 0, 800, 172, [
        I('Image_3', 400, 98, 640, 140, 'Event_Banner1.png', s9=False),
        P('Mask', 80, 28, 640, 140, visible=False,
          opts=dict(colorType=1, bgColorR=0, bgColorG=0, bgColorB=0, bgColorOpacity=150)),
        I('Icon_Lock', 400, 98, 80, 80, 'QuestBut_Lock.png', s9=False, visible=False),
        I('Icon_Complete', 680, 140, 80, 80, 'AchievedComplete.png', s9=False, scale=0.8, visible=False),
        I('Plate', 400, 14, 590, 30, 'Plate09.png', s9=False, visible=False, children=[
            L('Txt_Limit', 0, 0, 560, 28, '', 20)]),
        I('Plate_Unlock', 400, 14, 590, 30, 'Plate09.png', s9=False, visible=False, children=[
            L('Txt_Unlock', 0, 0, 560, 28, '', 20)]),
        P('EV_DetailButton', 640, 8, 140, 44),
        L('Txt_EV_Detail', 710, 30, 130, 30, '', 20),
        P('Panel_Eff', 80, 28, 640, 140, visible=False)])),
    # Pulsanti laterali della mappa di un evento (aperto dal tocco su un banner):
    # AdventureTop2_EV_Button cerca Button_EV_Board_0 (facoltativo, nascosto) e Button_EV_Board
    # con Txt (102920005 «Event Boards» / 102920007 «Special Boards»); AdventureTop2_Raid_Button
    # Button_EV_Board con Txt (102920006 «Raid Boards»). Dal pulsante laterale originale
    # AdventureTop2_Multi_Button (Button_Mu_Board «Multi Board», World_Ico10A/B).
    'AdventureTop2_EV_Button.json': ('copy', 'AdventureTop2_Multi_Button.json',
                                     {'Button_Mu_Board': 'Button_EV_Board',
                                      'Button_Last_Member': 'Button_EV_Board_0'}, False, [
        ('opts', 'Button_EV_Board_0', dict(visible=False))]),
    'AdventureTop2_Raid_Button.json': ('copy', 'AdventureTop2_Multi_Button.json',
                                       {'Button_Mu_Board': 'Button_EV_Board'}, False, [
        ('opts', 'Button_Last_Member', dict(visible=False))]),
    # Colosseo: tessera del menu Quests, popup di scelta del modo.
    # Cerca: Txt_PvP_off (Label: 106140105 «No event is being held.» / 106140106 / 106140107,
    # visibile se il PVP non e' disponibile), Panel con Txt (106140108 «Select a mode.»), Title2
    # (visibile se il PVP e' disponibile), Colosseum_But e PvP_But (pulsanti: Colosseum ->
    # = 6: GET /user/notice, poi GET /colosseum; PvP spento se non
    # disponibile), Close_Button. Finestra blu Win04 come i popup originali, due
    # pulsanti grandi con il nome del modo (testo fisso: il codice non lo scrive).
    'PvP_SelectWindow.json': ('build', P('PvP_SelectWindow', 0, 0, 960, 640, [
        I('Win', 480, 320, 640, 400, 'Win04.png',
          opts=dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        I('Panel', 480, 470, 560, 40, 'Plate18.png', s9=False, children=[L('Txt', 0, 0, 540, 34, '', 24)]),
        # pulsanti alti 120: 9-slice anche in verticale a meta' della texture (con capInsetsY=0 la
        # prima riga, quasi trasparente, si stirava in una fascia chiara sopra il pulsante)
        B('Colosseum_But', 340, 320, 230, 120, 'But01', 'Coliseum', 30, label='Txt_Colosseum', opts=TALL9),
        B('PvP_But', 620, 320, 230, 120, 'But01', 'PVP', 30, label='Txt_PvP', opts=TALL9),
        I('Title2', 620, 392, 70, 56, 'Deck_Medal_New.png', s9=False, visible=False),
        L('Txt_PvP_off', 620, 220, 260, 60, '', 18, opts=dict(hAlignment=1, vAlignment=1)),
        B('Close_Button', 790, 510, 64, 64, 'But_Close', None)])),
    # Pulsanti laterali del Colosseo (dopo GET /colosseum; posizione):
    # Button_Ranking/Txt (103300021 «Ranking»), Button_Reward/Txt (103300022 «Tier Rewards»),
    # Button_Colosseum_Board/Txt (103300023 «Coliseum Boards»); tocchi. Dal
    # pulsante laterale originale AdventureTop2_Multi_Button, terzo pulsante clonato.
    'AdventureTop2_Colosseum_Button.json': ('copy', 'AdventureTop2_Multi_Button.json',
                                            {'Button_Mu_Board': 'Button_Colosseum_Board',
                                             'Button_Last_Member': 'Button_Ranking'}, False, [
        ('clone', 'Button_Ranking', 'Button_Reward', 'Panel_1'),
        ('opts', 'Button_Reward', dict(y=248, visible=True))]),
    # Celle della mappa del Colosseo (tipo 3 della vista dei pannelli: Cursor,
    # FaceBook_PhotoPanel facoltativo): stessi widget della cella delle quest
    # AdventureTop2_Adv_Panel_ver120 (originale).
    'AdventureTop2_Colosseum_Panel.json': ('copy', 'AdventureTop2_Adv_Panel_ver120.json', {}, False, []),
    # Costo del deck superato su «Begin» (da
    # quando trova il costo > maxDeckCost; anche
    # ). Cerca: 4Line_Label (103000020 «Exceeds
    # equipment cost. Please change your Medals.»), Button_Equip con Txt_Equip (100100006
    # «Equipment», porta al deck), Close_Button. Dal popup OK originale con la X tonda.
    'PopupNormal_Cost_Over.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                                   {'Button_OK': 'Button_Equip', 'Txt_OK': 'Txt_Equip'}, False, [
        ('text', '4Line_Label', ''),
        ('add', 'NormalText_Window01', B('Close_Button', 300, 141, 64, 64, 'But_Close', None))]),
    # Uscita dal Deck con deck oltre il costo (parametro = deck 1-3
    # oltre il costo). Cerca: 4Line_Label (101200022 «Exceeds equipment cost of %s.», scritto con
    # ), Button_Equip con Txt_Equip (100100001 «OK»), DeckBut_Area (Panel: il codice
    # vi aggiunge un'icona Deck_But0N_On per deck, 125 px l'una dall'altra, centrate).
    'DeckEdit_Cost_Over_ver131.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                                       {'Button_OK': 'Button_Equip', 'Txt_OK': 'Txt_Equip'}, False, [
        ('text', '4Line_Label', ''),
        ('opts', 'NormalText_Window01', dict(height=380, scale9Height=380, scale9Enable=True, capInsetsX=50,
                                             capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        ('opts', '4Line_Label', dict(y=105, height=100, areaHeight=100, hAlignment=1, vAlignment=1)),
        ('opts', 'Button_Equip', dict(y=-134)),
        ('add', 'NormalText_Window01', P('DeckBut_Area', -250, -70, 500, 100))]),
    # AP insufficiente: ricarica con jewel. Cerca: Txt_Wording
    # (102600018 «Not enough AP. Spend %d Jewels to fully restore AP?», resa XML), Txt_Wording2
    # (102600047), Txt_AP_Recovery (102600051 «1 AP restored in %02d:%02d.»),
    # Txt_CrownPossessed (100310002 «Held»), Txt_CrownPossessed_Label, Button_OK/Txt_OK,
    # Button_Close/Txt_Cancel. Stessi widget e stile di PopupNormal_Continue_Multi (originale),
    # piu' la riga del tempo; niente conto alla rovescia.
    'PopupNormal_AP_Recovery.json': ('copy', 'PopupNormal_Continue_Multi.json', {}, False, [
        NO_PLATE21,
        ('opts', 'NormalText_Window03', dict(height=380, scale9Height=380)),
        ('opts', 'Txt_Wording', dict(y=118)),
        ('opts', 'Txt_Wording2', dict(y=52)),
        ('opts', 'Txt_CrownPossessed', dict(y=-38)),
        ('opts', 'LB_Jewel', dict(y=-38)),
        ('opts', 'Txt_CrownPossessed_Label', dict(y=-37)),
        ('opts', 'Button_OK', dict(y=-128)),
        ('opts', 'Button_Close', dict(y=-128)),
        ('add', 'NormalText_Window03', L('Txt_AP_Recovery', 0, 12, 612, 34, '', 22,
                                         opts=dict(hAlignment=1, vAlignment=1)))]),
    # Gauge del keyblade al massimo con jewel, dal riquadro del keyblade prima della quest
    # (tocco gestito in). Cerca: Txt_Wording
    # (103000012 «Spend %d Jewels to max out this Keyblade's special attack gauge?», XML),
    # Txt_CrownPossessed (100310002 «Held»), Txt_CrownPossessed_Label, Button_OK/Txt_OK,
    # Button_Close/Txt_Cancel: PopupNormal_Continue_Multi senza la seconda riga e il conto.
    'PopupNormal_Ability_MAX.json': ('copy', 'PopupNormal_Continue_Multi.json', {}, False, [
        NO_PLATE21,
        ('text', 'Txt_Wording2', ''),
        ('opts', 'Txt_Wording2', dict(visible=False)),
        ('opts', 'Txt_Wording', dict(y=80, height=90))]),
    # Medaglie oltre il limite (da Begin, Medal List, negozio, ...: possedute >=
    # userDetail.maxMedal). Cerca: NormalText_Window01, 4Line_Label (102610002/3 + 102610008,
    # resa XML), Button_Extension/Txt_Extension (102610007 «Increase Storage»), Button_Mix/Txt_Mix
    # (101300001 «Level Up»), Button_Sell/Txt_Sell (100100029 «Sell»); nomi letti dalle stringhe
    # (widget_lookup.py non li decodifica tutti). Dal popup OK/Annulla originale, tre pulsanti.
    'PopupNormal_MedalOver.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                   {'Button_OK': 'Button_Mix', 'Txt_OK': 'Txt_Mix',
                                    'Button_Close': 'Button_Sell', 'Txt_Cancel': 'Txt_Sell'}, False, [
        ('text', '4Line_Label', ''),
        ('text', 'Txt_Mix', 'Level Up'),
        ('text', 'Txt_Sell', 'Sell'),
        ('opts', 'NormalText_Window01', dict(width=700, scale9Width=700, height=380, scale9Height=380,
                                             scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1,
                                             capInsetsHeight=200)),
        ('opts', '4Line_Label', dict(y=55, width=640, areaWidth=640, height=200, areaHeight=200)),
        ('clone_r', 'Button_Mix', 'Button_Extension', 'NormalText_Window01', {'Txt_Mix': 'Txt_Extension'}),
        ('opts', 'Button_Extension', dict(x=-215, y=-130, visible=True)),
        ('text', 'Txt_Extension', 'Increase\nStorage'),
        ('opts', 'Txt_Extension', dict(fontSize=22)),
        ('opts', 'Button_Mix', dict(x=0, y=-130, normalData={'path': 'But03_Off.png', 'plistFile': '', 'resourceType': 0},
                                    pressedData={'path': 'But03_On.png', 'plistFile': '', 'resourceType': 0})),
        ('opts', 'Button_Sell', dict(x=215, y=-130))]),
    # Scelta della medaglia a cui dare un trait («Exchange» di una riga Traits).
    'MoogleShop_Traits_MedalSelect_Pop_ver410.json': ('func', 'trait_medal_select_popup'),
    # Profilo (open carica la scena nascosta e chiede
    # GET /user/profile, azione 5; createLayout). La scena ha UnderUI (Button_A..D
    # con Txt_A..D, Button_Invitation, Txt) e LeftUI. Il contenitore (lambda $_17,
    # ) = AvatarInfo_Oneself_ver131 con sopra AvatarInfo_User_ver260 («User»,
    # zorder 2); vi aggiunge le pagine TxtLayer1 = AvatarInfo_Txt_ver340
    # (originale: statistiche, LUX, ranking, Share, Close_Button, Button_Change) e TxtLayer2 =
    # AvatarInfo_Txt2. Aspetto da reference\profile\profile_06.png (fotogramma 640x360, area
    # di gioco 540x360 da x=50: x = (x'-50)/0,5625, y = (360-y')/0,5625): barra in basso con
    # Titles / Name/Message / Play Style / Outfits rossi.
    # LeftUI/RightUI: createLayout fa del loro primo figlio il bersaglio di un pulsante (profilo
    # precedente/successivo): le frecce ‹ › ai bordi dello schermo in profile_06 (x' 10 e 628,
    # y' 175 -> x -71 e 1028, y 329), area toccabile centrata sulla freccia come in
    # SlideMedalInfo_Left/Right
    'AvatarInfoScene_A_ver131.json': ('scene', [('UnderUI', 'publish/AvatarInfo_Under_Gen.json'),
                                                ('LeftUI', 'publish/AvatarInfo_Left_Gen.json'),
                                                ('RightUI', 'publish/AvatarInfo_Right_Gen.json')]),
    'AvatarInfo_Left_Gen.json': ('build', P('Panel_Left', -71, 329, 90, 160, [
        I('Arrow01', 0, 0, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.55)])),
    'AvatarInfo_Right_Gen.json': ('build', P('Panel_Right', 1028, 329, 90, 160, [
        I('Arrow01', 0, 0, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.55, flipX=True)])),
    'AvatarInfo_Under_Gen.json': ('build', P('avatar_under_root', 0, 0, 960, 64, [
        B('Button_A', 107, 30, 230, 64, 'But01', 'Titles', 28, label='Txt_A', opts=BUTS),
        B('Button_B', 391, 30, 230, 64, 'But01', 'Name/Message', 28, label='Txt_B', opts=BUTS),
        B('Button_C', 596, 30, 230, 64, 'But01', 'Play Style', 28, label='Txt_C', opts=BUTS),
        B('Button_D', 853, 30, 230, 64, 'But01', 'Outfits', 28, label='Txt_D', opts=BUTS),
        B('Button_Invitation', 480, 100, 230, 64, 'But01', '', 28, label='Txt', opts=BUTS, visible=False)])),
    'AvatarInfo_Oneself_ver131.json': ('build', P('Oneself', 0, 0, 960, 640, [
        I('Win', 487, 350, 946, 570, 'Win04.png',
          opts=dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200))])),
    # «User»: Base_User (il codice vi carica Plate10) con Union_Symbol
    # (img/union/Union_%02d), Txt_Party/Party_Name, Txt_LV/Txt_LV_Label, MVP_Crown
    # (CrownIcon_Img img/ui/AvtInfo_CrownIcon%d, Crown_Label, CrownNum_Label) e MVP_Trophy
    # (Trophy_Img, Trophy_Label, TrophyNum_Label); Party_Button/Txt_PartyButton.
    # Struttura come Offline_Record_Left (versione offline: user_name, union_symbol,
    # mvp_crown, mvp_trophy); posizioni da profile_06 (targa del nome x 27-418, y 547; Party
    # y 500).
    'AvatarInfo_User_ver260.json': ('build', P('User_root', 0, 0, 960, 640, [
        I('Base_User', 222, 547, 390, 52, 'Plate10.png',
          opts=dict(scale9Enable=True, capInsetsX=40, capInsetsY=20, capInsetsWidth=1, capInsetsHeight=1), children=[
              I('Union_Symbol', -150, 0, 128, 128, 'Union_03.png', s9=False, scale=0.5),
              # nome del giocatore (stringa composta sullo stack, banco pf10)
              L('My_Name', 20, 0, 280, 34, '', 26)]),
        # miniatura dell'account collegato a destra della targa del nome,
        # come in profile_06 (x' 272, y' 52); la mostra il codice secondo isLinkThumbnail
        I('FaceBook_PhotoPanel', 390, 547, 60, 60, 'FaceBook_PhotoPanel01.png', s9=False, scale=0.85,
          visible=False, children=[I('FaceBook_Photo', 30, 30, 50, 50, 'FaceBook_Photo.png', s9=False)]),
        # titolo: targa img/userTitle/title_%04d caricata dal codice, testo
        # «sinistra destra» in RankTitle_Name; come AvatarTitle_PanelButton_Big2 (610x82) ma
        # alto quanto la riga del titolo del riferimento (y 613)
        I('RankTitle_Board', 222, 610, 406, 54, 'title_1000.png', s9=False, children=[
            L('RankTitle_Name', 0, 0, 380, 34, '', 22)]),
        I('Party_Plate', 222, 500, 390, 26, 'Plate03.png', opts=PLATE3),
        L('Txt_Party', 90, 500, 110, 24, 'Party', 18),
        L('Party_Name', 300, 500, 230, 24, '', 20, opts=dict(anchorPointX=0.5)),
        L('Txt_LV', 40, 470, 40, 20, '', 16, visible=False),
        L('Txt_LV_Label', 80, 470, 60, 20, '', 16, visible=False),
        P('MVP_Crown', 30, 230, 171, 42, [
            I('CrownIcon_Img', 33, 18, 56, 40, 'AvtInfo_CrownIcon4.png', s9=False),
            L('Crown_Label', 83, 12, 26, 26, '', 18),
            L('CrownNum_Label', 120, 15, 80, 33, '', 22)], visible=False),
        P('MVP_Trophy', 30, 100, 171, 42, [
            I('Trophy_Img', 27, 12, 56, 40, 'AvtInfo_trophyIcon4.png', s9=False),
            L('Trophy_Label', 71, 5, 23, 23, '', 18),
            L('TrophyNum_Label', 110, 8, 80, 33, '', 22)], visible=False),
        B('Party_Button', 120, 500, 230, 40, 'But01', 'Party', 20, label='Txt_PartyButton', opts=BUTS,
          visible=False)])),
    # Pagina 2 (Button_Change): record del giocatore. Copia della pagina 1
    # (stesso avatar e anello) con il riquadro dei record: Scroll_Area (vi crea
    # RecordScrollView), Txt_Money/_Label, Txt_MoguPoint/_Label, Txt_LastLogin/_Label,
    # Txt_Timezone con _1/_2/_3_Label, Txt_Style/_Label.
    # Senza l'anello delle medaglie: con Area_Revolver anche qui riusa l'anello
    # della pagina 1 prima che abbia caricato DeckEdit_Revolver (crash, banco pf15)
    # Home: un tocco sulla piazza nasconde i menu e, per chi non e' in party (userParty.isJoin
    # 0), mostra Chirithy (NPC 999) con una nuvoletta: il codice usa solo
    # Txt_Name («Join a party and make new friends!», 101000022). Mancava in
    # ogni risorsa: crash in GUIReader (stage_gen\pet_crash). Copia della nuvoletta dell'avatar,
    # testo su due righe.
    'MyPage_ChirishiBaloon.json': ('copy', 'MyPage_AvatarBaloon_ver240.json', {}, False, [
        ('opts', 'Txt_Name', dict(y=4, width=150, height=60, areaWidth=150, areaHeight=60,
                                  ignoreSize=False, fontSize=15, hAlignment=1, vAlignment=1)),
        ('opts', 'Txt_Wording', dict(visible=False)),
        ('opts', 'LoginTime_Icon', dict(visible=False)),
        ('opts', 'FaceBook_PhotoPanel', dict(visible=False))]),
    # Sconfitta in solo: popup «Continue» (parametro & 1 = multi). Esisteva solo
    # PopupNormal_Continue_Multi (stessi widget: Txt_Wording/2, Txt_CrownPossessed/_Label,
    # Button_OK/Txt_OK, Button_Close/Txt_Cancel, Txt_Countdown); il conto alla rovescia e'
    # del multigiocatore.
    'PopupNormal_Continue.json': ('copy', 'PopupNormal_Continue_Multi.json', {}, False, [
        NO_PLATE21]),
    'AvatarInfo_Txt2.json': ('copy', 'AvatarInfo_Txt_ver340.json',
                             {'Area_Revolver': 'Area_Revolver_None', 'Area_RevolverPet': 'Area_RevolverPet_None'},
                             False, [
        ('add', 'Dummy', P('Record_Area', 20, 70, 300, 420, [
            I('Record_Base', 150, 210, 300, 420, 'Av_Panel1.png',
              opts=dict(scale9Enable=True, capInsetsX=40, capInsetsY=40, capInsetsWidth=1, capInsetsHeight=1)),
            P('Scroll_Area', 10, 10, 280, 200),
            L('Txt_Money', 20, 400, 130, 24, 'Munny', 18, opts=dict(anchorPointX=0)),
            L('Txt_Money_Label', 280, 400, 140, 24, '0', 18, opts=dict(anchorPointX=1)),
            L('Txt_MoguPoint', 20, 372, 130, 24, 'Moogle Points', 18, opts=dict(anchorPointX=0)),
            L('Txt_MoguPoint_Label', 280, 372, 140, 24, '0', 18, opts=dict(anchorPointX=1)),
            L('Txt_LastLogin', 20, 344, 130, 24, 'Last Login', 18, opts=dict(anchorPointX=0)),
            L('Txt_LastLogin_Label', 280, 344, 160, 24, '', 18, opts=dict(anchorPointX=1)),
            L('Txt_Timezone', 20, 316, 130, 24, 'Play Time', 18, opts=dict(anchorPointX=0)),
            L('Txt_Timezone_1_Label', 280, 316, 160, 24, '', 18, opts=dict(anchorPointX=1)),
            L('Txt_Timezone_2_Label', 280, 290, 160, 24, '', 18, opts=dict(anchorPointX=1)),
            L('Txt_Timezone_3_Label', 280, 264, 160, 24, '', 18, opts=dict(anchorPointX=1)),
            L('Txt_Style', 20, 236, 130, 24, 'Play Style', 18, opts=dict(anchorPointX=0)),
            L('Txt_Style_Label', 280, 236, 160, 24, '', 18, opts=dict(anchorPointX=1))]))]),
    # Name/Message (Button_B): stesso layout per la variante U13 (il codice usa
    # Txt_Comment_Label_U13 al posto del TextField)
    'AvatarInfo_Comment_ver132.json': ('func', 'avatar_comment_popup'),
    'AvatarInfo_Comment_U13_ver132.json': ('func', 'avatar_comment_popup'),
    # Play Style (Button_C), assente dalle risorse. Aspetto da
    # reference\profile\profile_16.png (finestra x' 110-530, y' 10-355): «Play Time (Pacific
    # Time)», 6 fasce orarie su due righe, «Select up to 3.» giallo, «Play Style» con
    # Hardcore/Core/Casual, Cancel arancione (Button_Close/Txt_Cancel) e OK rosso. I pulsanti
    # sono But16 (218x52, blu; premuto = azzurro, la scelta): il codice non carica texture.
    'AvatarInfo_PlayStyle.json': ('build', P('PlayStyle_root', 0, 0, 960, 640, [
        I('Win_PlayStyle', 480, 315, 747, 613, 'Win04.png',
          opts=dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        L('Txt_PlayTime', 146, 592, 400, 30, 'Play Time', 24, opts=dict(anchorPointX=0, hAlignment=0)),
        # CheckBox (ne registra l'evento: con Button crash, banco ps2)
        *[C('Button_PlayTime_' + c, 258 + 222 * (k % 3), 519 - 94 * (k // 3), 218, 52, 'But16',
            [L('Txt_PlayTime_' + c, 0, 0, 208, 44, '', 22)]) for k, c in enumerate('ABCDEF')],
        L('Txt_Select', 480, 356, 500, 28, '', 22, opts=dict(colorR=255, colorG=230, colorB=60)),
        L('Txt_Setting', 700, 592, 200, 24, '', 18, visible=False),
        L('Txt_Num_Lavel', 820, 592, 80, 24, '', 18, visible=False),
        L('Txt_Style', 146, 254, 300, 30, 'Play Style', 24, opts=dict(anchorPointX=0, hAlignment=0)),
        *[C('Button_Style_' + c, 258 + 222 * k, 183, 218, 52, 'But16',
            [L('Txt_Style_' + c, 0, 0, 208, 44, '', 22)]) for k, c in enumerate('ABC')],
        B('Button_Close', 325, 66, 205, 62, 'But03', 'Cancel', 28, label='Txt_Cancel', opts=BUT9),
        B('Button_Ok', 633, 66, 205, 62, 'But01', 'OK', 28, label='Txt_OK', opts=BUT9)])),
    # Titles (Button_A): stessi nomi della versione offline originale
    # (Pre_Area per l'anteprima, AvTitleWin con Title A/B, Plate1/2, Button_Plate «Nameplate»)
    # Button_Ok e il separatore non li usa il codice (nessuna ricerca): nascosti, finestra
    # accorciata come in reference\profile\profile_11.png (finisce sotto «Nameplate»)
    'AvatarTitle_Base.json': ('copy', 'Offline_AvatarTitle_Base.json', {}, False, [
        ('opts', 'Button_Ok', dict(visible=False)),
        ('opts', 'Img_Separator', dict(visible=False)),
        ('opts', 'PopupNormal_04', dict(height=580, scale9Height=580)),
        ('opts', 'Close_Button', dict(y=279))]),
    # Avatar Boards, elenco: nessun layout Sphere* nelle risorse. Aspetto da
    # reference\avatar_boards\avatar_boards_list_01.jpg (2400x1080: x = (x'-390)/1,6875,
    # y = (1080-y')/1,6875) e ab_29-32.png (video 2017): carosello delle bacheche al centro,
    # in basso «Avatar Coins» (Coin, Txt_Coin_Title, Txt_Coin), nome della bacheca
    # (TitleBar, Txt_SphereBoard_Label), «Nodes 0 / 19» (Txt_Open con Txt_Num_Label e
    # Txt_Total_Label, stile della riga Lux del Profilo), Filter arancione (Button_Filter,
    # Txt_Filter) con il conteggio (Bar_Filter), avviso a destra (Txt_Caution). Il codice
    # cerca anche BG, BoardNone_txt, Img_Win_L/S, BoardDetail/DetailButton/Txt_Detail.
    'SphereBoardScene_ver310.json': ('scene', [('CenterUI', 'publish/SphereBoard_Gen.json'),
                                               ('LeftUI', 'publish/MedalSell_Back.json', 0, 576)]),
    'SphereBoard_Gen.json': ('build', P('sphere_board_root', 0, 0, 960, 640, [
        P('BG', 0, 0, 960, 640),
        L('BoardNone_txt', 480, 341, 600, 40, '', 26, visible=False),
        # carosello (SelectArea, frecce LeftUI_Arrow/RightUI_Arrow ai bordi come in
        # avatar_boards_list_01, x' 288 e 2106 -> x -60 e 1017)
        # posti delle carte (li cerca dentro SelectArea, banco ab9): centrale e
        # laterali come in avatar_boards_list_01 (x' 1200/738/1662 -> 480/206/754)
        # y dei posti ignorata dal codice: con SelectArea a 180 le carte finivano sotto la barra in
        # alto (banco v32, centro a y 518): abbassata di 177 per il centro a 341
        P('SelectArea', 0, 3, 960, 330, [
            P('LeftUI', 206, 140, 10, 10),
            P('RightUI', 754, 140, 10, 10),
            P('CenterUI', 480, 161, 10, 10)]),
        # il primo figlio diventa il bersaglio del pulsante (banco ab8): Panel con la freccia,
        # origine al centro come in SlideMedalInfo_Left/Right
        P('LeftUI_Arrow', -60, 341, 90, 160, [
            I('Arrow01', 0, 0, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.7)]),
        P('RightUI_Arrow', 1017, 341, 90, 160, [
            I('Arrow01', 0, 0, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.7, flipX=True)]),
        # costo della bacheca sotto la carta centrale (grande) e le laterali (piccola): il codice
        # cerca Txt_Coin e Txt_Coin_Title dentro Img_Win_L (banco ab4); riferimento: targa scura
        # con l'icona e «200» sotto la carta (x' 1200, y' 700 -> 480, 225)
        I('Img_Win_S', 480, 160, 200, 36, 'Plate02.png', opts=dict(PLATE3, opacity=0), visible=False),
        # trasparente: sotto le carte standard l'originale non mostra nulla (ab_ref_list_complete_01;
        # il «200» di avatar_boards_list_01 e' il prezzo in jewel dentro la carta, Jewel_Panel).
        # Con visible=False il codice la rimostrava (banco w1_list): opacity 0 su lei e i figli
        I('Img_Win_L', 480, 160, 200, 36, 'Plate02.png', opts=dict(PLATE3, opacity=0), children=[
            # figli di un'ImageView: coordinate dal centro (prima da 0,0: icona e numero a destra)
            I('Win_Coin_Icon', -72, 0, 90, 90, 'IncentiveIcon_14.png', s9=False, scale=0.35, opts=dict(opacity=0)),
            L('Txt_Coin_Title', -20, 0, 80, 24, '', 18, visible=False),
            L('Txt_Coin', 85, 0, 120, 30, '0', 26, opts=dict(anchorPointX=1, hAlignment=2, opacity=0))]),
        # riquadro «Avatar Coins» in basso a sinistra (Txt_Coin_Name_Label,
        # Txt_Coin_Label)
        # riquadro con la linguetta del titolo (Av_Panel1 di make_textures): Win04 in 9-slice non
        # scende sotto ~300 px di altezza (banco ab11)
        # come in ab_ref_list_complete_01: Win09 blu con il bordo chiaro, x 3-181, y 42-122
        I('Coin', 92, 82, 178, 80, 'Win09.png', opts=WIN9, children=[
              # icona della valuta: (banco ab10)
              I('SpherePointIcon', -66, 16, 90, 90, 'IncentiveIcon_14.png', s9=False, scale=0.3),
              L('Txt_Coin_Name_Label', 19, 16, 130, 24, 'Avatar Coins', 18),
              I('Coin_Base', 0, -17, 162, 30, 'Plate02.png', opts=PLATE3),
              L('Txt_Coin_Label', 66, -17, 120, 28, '0', 24, opts=dict(anchorPointX=1, hAlignment=2))]),
        I('TitleBar', 480, 92, 583, 50, 'Plate13.png',
          opts=dict(scale9Enable=True, capInsetsX=60, capInsetsY=10, capInsetsWidth=1, capInsetsHeight=1), children=[
              L('Txt_SphereBoard_Label', 0, 0, 540, 36, '', 26)]),
        I('Nodes_Base', 480, 32, 278, 30, 'Plate02.png', opts=PLATE3, children=[
            I('Nodes_Tab', -84, 0, 110, 26, 'Plate01.png', s9=False)]),
        L('Txt_Open', 396, 32, 100, 26, 'Nodes', 20, children=[
            L('Txt_Num_Label', 130, 0, 60, 30, '0', 26, opts=dict(colorR=255, colorG=230, colorB=60)),
            L('Txt_Slash', 165, 0, 20, 30, '/', 24),
            L('Txt_Total_Label', 200, 0, 60, 30, '0', 26)]),
        P('Bar_Filter', 810, 30, 115, 30, [
            # «54/54» (bacheche mostrate / totali): stessi nomi della riga Nodes (banco ab5)
            I('Bar_Filter_Base', 57, 15, 115, 28, 'Plate02.png', opts=PLATE3),
            L('Txt_Num_Label', 40, 15, 50, 28, '0', 24, opts=dict(anchorPointX=1, hAlignment=2, colorR=255,
                                                                     colorG=230, colorB=60)),
            L('Txt_Filter_Slash', 48, 15, 16, 28, '/', 22),
            L('Txt_Total_Label', 56, 15, 50, 28, '0', 22, opts=dict(anchorPointX=0, hAlignment=0))]),
        B('Button_Filter', 864, 96, 233, 68, 'But03', 'Filter', 30, label='Txt_Filter', opts=BUTS),
        L('Txt_Caution', 950, 168, 400, 26, '', 18, opts=dict(anchorPointX=1, hAlignment=2)),
        P('BoardDetail', 0, 0, 10, 10, [
            B('DetailButton', 480, 180, 200, 52, 'But16', 'Details', 22, label='Txt_Detail', opts=BUT9,
              visible=False)])])),
    # Carta del carosello (la carica la riempie): Select_Base
    # (fondo, Board_0001 306x306: l'unica carta rimasta nelle risorse, grigio-azzurra come nei
    # fotogrammi del 2017), Select_Board (img/sphere_board/Board_%04d) e Select_Kind
    # (img/sphere_kind/Kind_%04d, il segno del genere in alto a destra: Kind_0001)
    'SphereBoard_Select_Icon_ver130.json': ('build', P('Select_Icon', 0, 0, 306, 306, [
        # Select_Board (sfondo) sotto Select_Base (costume): al contrario copriva il costume (banco v32)
        I('Select_Board', 153, 153, 306, 306, 'Board_0001.png', s9=False),
        I('Select_Base', 153, 153, 306, 306, 'Board_0001.png', s9=False),
        I('Select_Kind', 153, 153, 306, 306, 'Kind_0001.png', s9=False),
        L('Count_Label', 153, 30, 200, 30, '', 22, visible=False),
        # cercati anche (riempimento della carta; senza: crash con una bacheca
        # nell'elenco, banco v32): New, Clear (completata), Select_On (carta scelta), costo in
        # Jewel (Jewel_Panel, LB_Jewel, Txt_Jewel_Label), No_Panel/Txt_No_Label, Txt_Offer_Ends
        I('New', 60, 280, 69, 30, 'Deck_Medal_New.png', s9=False, visible=False),
        # bacheca completata: fiocco rosso in alto a sinistra e fascia «COMPLETE» in basso a destra
        # (ab_ref_list_complete_01; Sphere_Board_Clear di make_textures, 306x306 come la carta)
        I('Clear', 153, 153, 306, 306, 'Sphere_Board_Clear.png', s9=False, visible=False),
        I('Select_On', 153, 153, 306, 306, 'Board_0001.png', s9=False, visible=False),
        P('Jewel_Panel', 53, 10, 200, 40, [
            I('LB_Jewel', 100, 20, 200, 30, 'Plate02.png', opts=PLATE3, children=[
                I('Icon_Jewel', -80, 0, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.3)]),
            L('Txt_Jewel_Label', 120, 20, 120, 26, '0', 22)], visible=False),
        # «No. 49» sopra la carta (ab_sheet) nella linguetta grigio-azzurra (Sphere_No_Tab)
        P('No_Panel', 53, 300, 200, 40, [I('No_Tab', 100, 20, 195, 30, 'Sphere_No_Tab.png', s9=False),
                                         L('Txt_No_Label', 100, 20, 200, 36, '', 20)], visible=False),
        L('Txt_Offer_Ends', 153, 60, 280, 24, '', 18, visible=False)])),
    # Bacheca (specifica in stage_gen\boards\LAYOUT.md): il
    # codice cerca G11..G59 (5 righe x 9 colonne, tutte obbligatorie, riga 1 in alto; il nodo
    # va al centro della cella), Grid/Grid_R/Info/LeftUI (animazioni di entrata e uscita, il
    # primo figlio da' la distanza), carta (Select_*), monete, premio, Button e Button_All con
    # il proprio Txt_Release. Misure dagli screenshot del 2017 (reference ab_29-33, bacheca 63)
    'SphereScene_ver310.json': ('scene', [('Grid', 'publish/SphereScene_Grid.json'),
                                          ('Grid_R', 'publish/SphereScene_GridR.json'),
                                          ('Info', 'publish/SphereScene_Info.json'),
                                          ('LeftUI', 'publish/MedalSell_Back.json', 0, 576)]),
    'SphereScene_Grid.json': ('build', P('sphere_grid_root', 0, 0, 960, 640, [
        P('Grid_Area', 0, 0, 960, 640, [
            P('G%d%d' % (r + 1, c + 1), 75 + 101 * c - 50, 454 - 78 * r - 39, 101, 78)
            for r in range(5) for c in range(9)])])),
    'SphereScene_GridR.json': ('build', P('sphere_gridr_root', 0, 0, 960, 640, [
        P('Grid_R_Area', 0, 0, 10, 10)])),
    'SphereScene_Info.json': ('build', P('sphere_info_root', 0, 0, 960, 640, [
        P('Info_Area', 0, 0, 960, 640, [
            I('Txt_SphereBoard_Plate', 113, 505, 220, 36, 'Plate13.png',
              opts=dict(scale9Enable=True, capInsetsX=60, capInsetsY=10, capInsetsWidth=1, capInsetsHeight=1)),
            L('Txt_SphereBoard_Label', 113, 505, 210, 30, '', 22),
            I('Select_Board', 120, 408, 306, 306, 'Board_0001.png', s9=False, scale=0.5),
            I('Select_Base', 120, 408, 306, 306, 'Board_0001.png', s9=False, scale=0.5),
            I('Select_Kind', 120, 408, 306, 306, 'Kind_0001.png', s9=False, scale=0.5),
            # riquadri in basso come ab_ref_node_check_01 (1080p: x = (x'-150)/1,6875,
            # y = 640 - y'/1,6875): Win09 blu con il bordo chiaro, Avatar Coins x 3-182, barra del
            # premio x 191-957, pastiglia del premio con il contorno azzurro (Plate18), Unlock
            # arancione alto quanto la barra (x 836-949). «Unlock All» non c'e' negli originali (2017):
            # pulsante blu dentro la barra, a sinistra di Unlock (sopra copriva i nodi della riga 5)
            I('Coin', 92, 45, 180, 83, 'Win09.png', opts=WIN9, children=[
                  *[I(n, -66, 16, 90, 90, 'IncentiveIcon_14.png', s9=False, scale=0.3, visible=(n == 'SpherePointIcon'))
                    for n in ('SpherePointIcon', 'SpherePointIcon_OC', 'SpherePointIcon_EV', 'SpherePointIcon_Raid',
                              'SpherePointIcon_SP')],
                  L('Txt_Coin_Name_Label', 19, 16, 130, 24, 'Avatar Coins', 18),
                  I('Coin_Base', 0, -18, 164, 30, 'Plate02.png', opts=PLATE3),
                  L('Txt_Coin_Label', 66, -18, 120, 28, '0', 24, opts=dict(anchorPointX=1, hAlignment=2))]),
            I('Incentive_Bar', 574, 45, 766, 83, 'Win09.png', opts=WIN9),
            L('Txt_Incentive_Label', 275, 44, 160, 30, '', 22),
            I('Incentive_Name_Base', 541, 44, 354, 40, 'Plate18.png',
              opts=dict(scale9Enable=True, capInsetsX=20, capInsetsY=19, capInsetsWidth=1, capInsetsHeight=1)),
            L('Txt_Incentive_Name_Label', 541, 44, 340, 32, '', 18),
            # But06: arancione come But03 ma con la variante _Disable (grigio a bacheca completa, come ab_ref)
            B('Button', 893, 44, 114, 64, 'But06', 'Unlock', 26, label='Txt_Release', opts=BUT9),
            B('Button_All', 777, 44, 104, 52, 'But16', 'Unlock All', 18, label='Txt_Release', opts=BUT16)])])),
    # nodo della bacheca (posto a (-50,-50) sul nodo): Get (spunta, nascosta
    # all'inizio), Txt_Incentive_Label, Txt_Price_Label (costo in monete)
    'Sphere_Incentive.json': ('build', P('Sphere_Incentive', 0, 0, 100, 100, [
        # spunta gialla dei nodi sbloccati (ab_ref_node_check_01; Sphere_Node_Check di make_textures):
        # centro a (+1, +24) dal centro del nodo (50,50), punta lunga oltre il bordo in alto a destra
        I('Get', 51, 74, 64, 56, 'Sphere_Node_Check.png', s9=False, visible=False),
        L('Txt_Incentive_Label', 50, 20, 100, 20, '', 14, visible=False),
        L('Txt_Price_Label', 90, 67, 50, 24, '0', 20)])),
    # Missioni (pulsante a pergamena della home):
    # nessun layout ne' riferimento visivo trovato (annotato in HANDOFF). Finestra nello stile
    # dei popup KHUX: schede tab1..tab4 in alto (MyMission_Category, GroupIcon, Icon_Crown),
    # elenco Scroll_Area, «Stock» (Txt_Stock con Txt_Stock_Num_Label / Txt_Stock_All_Label),
    # «Receive All» (Button/Txt_ReceiveAll), Mask_Area/Mask/Txt_Warning, Txt_None,
    # Cautio_Panel/Txt, Close_Button
    # Disposizione da reference\other_menu\missions_list_01.jpg (Limited aperta): schede
    # 176x50 sopra la finestra (il codice vi carica img/ui/MyMission_Category_On/_Off e
    # MyMission_GroupIcon1/2), omini a sinistra, corona in alto a destra; elenco di 3 righe;
    # in basso «Missions Cleared n/m» in una pillola scura e «Collect All» a destra; X sull'angolo.
    # Mask_Area (avviso «Join a party...» delle settimanali senza party) copre solo l'elenco:
    # stesa su tutta la finestra copriva anche le schede e dopo Weekly Daily non si toccava piu'
    'MyPageMission_Base_ver320.json': ('build', P('mission_root', 0, 0, 960, 640, [
        I('Win_Mission', 480, 312, 884, 540, 'Win04.png',
          opts=dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)),
        *[I('tab%d' % k, 133 + 181 * (k - 1), 606, 176, 50, 'MyMission_Category_Off.png', s9=False, children=[
            L('Txt_Tab', 18, -2, 120, 40, '', 22),
            L('MyMission_Category', 0, 0, 150, 40, '', 20, visible=False),
            I('GroupIcon', -58, -2, 28, 38, 'MyMission_GroupIcon1.png', s9=False),
            P('UpArrow', 70, 0, 10, 10),
            I('Icon_Crown', 78, 20, 56, 40, 'AvtInfo_CrownIcon4.png', s9=False, scale=0.6, visible=False),
            I('Icon_New', -60, 26, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False)])
          for k in range(1, 5)],
        I('Grid_Mission', 480, 333, 860, 452, 'Panel04.png', opts=GRID),
        P('Scroll_Area', 55, 111, 850, 444),
        L('Txt_None', 480, 333, 600, 40, '', 24, visible=False),
        I('Stock_Base', 262, 74, 426, 28, 'MyMission_Stock.png', s9=False),
        P('Stock', 66, 54, 400, 40, [
            L('Txt_Stock', 0, 20, 240, 30, '', 20, opts=dict(anchorPointX=0, hAlignment=0)),
            L('Txt_Stock_Num_Label', 340, 20, 50, 30, '0', 20, opts=dict(anchorPointX=1, hAlignment=2)),
            L('Txt_Stock_Slash', 348, 20, 16, 30, '/', 20),
            L('Txt_Stock_All_Label', 356, 20, 50, 30, '0', 20, opts=dict(anchorPointX=0, hAlignment=0))]),
        B('Button', 805, 74, 190, 58, 'But01', '', 24, label='Txt_ReceiveAll', opts=BUTS),
        P('Mask_Area', 50, 107, 860, 452, [
            P('Mask', 0, 0, 860, 452, opts=dict(colorType=1, bgColorR=0, bgColorG=0, bgColorB=0, bgColorOpacity=110)),
            L('Txt_Warning', 430, 226, 700, 80, '', 24)], visible=False),
        P('Cautio_Panel', 50, 520, 860, 30, [L('Txt', 430, 15, 840, 26, '', 18)], visible=False),
        B('Close_Button', 912, 582, 64, 64, 'But_Close', None)])),
    # Riga di una missione (la carica in /
    # la riempiono): Panel_Present (vi mette PresentBOX_IconPanel),
    # Txt_Mission_Title_Label, Txt_Gift_Name_Label, Panel_Mask e GetStamp (riscossa),
    # ChallengeButton con Button_Challenge/Txt_Challenge, ReceiveButton con Button_Receive/
    # Txt_Receive, Txt_Storage_Date_Label (tempo rimasto), Gauge_Base con Gauge (il codice ne
    # porta la larghezza a numUpper/numLower di quella di Gauge_Base: 9-slice, ancora a sinistra),
    # Txt_Norma_Num_Label / Txt_Norma_Slash / Txt_Norma_All_Label, Complete. Senza il file il
    # client andava in crash all'apertura della finestra con delle missioni (banco v32)
    # Le righe distano 148 (dimensione della cella fissata dal codice) e la riga, posta a
    # (larghezza/2, 0), appare 44 a sinistra dell'area visibile (banco v32_missions4): riga alta
    # 144 come quelle dei Presents (158) e contenuto spostato di +44
    'MyPageMission_Panel.json': ('build', P('MyPageMission_Panel', 0, 0, 840, 144, [
        I('Row_Base', 468, 72, 836, 138, 'Panel04.png', opts=GRID),
        P('Panel_Present', 74, 32, 80, 80),
        L('Txt_Mission_Title_Label', 180, 108, 480, 30, '', 20, opts=dict(anchorPointX=0, hAlignment=0)),
        L('Txt_Gift_Name_Label', 180, 76, 300, 24, '', 18,
          opts=dict(anchorPointX=0, hAlignment=0, colorR=255, colorG=230, colorB=60)),
        # barra come quella LUX della home: fondo Gage_LUX_Base, riempimento Gage_LUX_Tip stirata
        # senza 9-slice (i bordi del 9-slice non scendono sotto la texture: a 0/1 la barra era
        # gia' piena per un terzo; Plate13 scura era quasi invisibile, banco m9)
        I('Gauge_Base', 330, 36, 300, 16, 'Gage_LUX_Base.png',
          opts=dict(scale9Enable=True, capInsetsX=8, capInsetsY=7, capInsetsWidth=1, capInsetsHeight=2), children=[
            I('Gauge', -148, 0, 296, 12, 'Gage_LUX_Tip.png', s9=False, ignoreSize=False, opts=dict(anchorPointX=0))]),
        L('Txt_Norma_Num_Label', 560, 36, 100, 24, '0', 20, opts=dict(anchorPointX=1, hAlignment=2)),
        L('Txt_Norma_Slash', 570, 36, 20, 24, '/', 20),
        L('Txt_Norma_All_Label', 580, 36, 110, 24, '0', 20, opts=dict(anchorPointX=0, hAlignment=0)),
        L('Complete', 330, 36, 200, 26, 'Complete!', 22, visible=False,
          opts=dict(colorR=255, colorG=230, colorB=60)),
        L('Txt_Storage_Date_Label', 870, 108, 220, 24, '', 18, opts=dict(anchorPointX=1, hAlignment=2)),
        # ChallengeButton/ReceiveButton li crea il codice attorno a Button_Challenge/Button_Receive
        # (se esistono gia' li prende per pulsanti suoi: crash, banco v32)
        B('Button_Challenge', 785, 54, 233, 68, 'But03', 'Challenge', 26, label='Txt_Challenge', opts=BUTS),
        B('Button_Receive', 785, 54, 233, 68, 'But01', 'Collect', 26, label='Txt_Receive', opts=BUTS),
        P('Panel_Mask', 50, 3, 836, 138, visible=False,
          opts=dict(colorType=1, bgColorR=0, bgColorG=0, bgColorB=0, bgColorOpacity=120)),
        # riscossa: la scritta COMPLETE delle missioni completate (World_Stage_Clear) sul pulsante
        I('GetStamp', 785, 54, 170, 34, 'World_Stage_Clear.png', s9=False, scale=0.95, visible=False)])),
    # «Other» del menu: vedi other_menu
    'MenuDialog_ver300.json': ('func', 'other_menu'),
    # Transfer Unions (I-107): ($_91) apre la
    # scelta dell'account e la conferma che caricano la variante
    # dark_ solo con il flag Dark Road, altrimenti quella senza prefisso,
    # assente da ogni risorsa (anche JP): crash immediato senza richieste. Copie dei dark_ con le
    # cornici KHUX; i pulsanti Apple/SQEX Bridge (non 9-slice) restano senza immagine come nel dark
    'MenuDialog_account_select_ver401.json': ('copy', 'dark_MenuDialog_account_select_ver401.json', {}, True),
    'MenuDialog_account_select_ok_cancel_ver401.json': ('copy', 'dark_MenuDialog_account_select_ok_cancel_ver401.json', {}, True),
    'TresCommu_CommunicationUser.json': ('build', P('commu_user', 0, 0, 200, 200)),
    'TresCommu_CommunicationOther.json': ('build', P('commu_other', 0, 0, 200, 200)),
    # Esito: popup OK originale, il messaggio e' Txt_Sell_Ok1. Come nel
    # popup originale (reference\material_sell\complete_thumb.png): «Complete!» in alto,
    # targhe dei guadagni al centro, OK in basso.
    'PopupNormal_MedalSell_Ok_ver350.json': ('copy', 'PopupNormal_Text_34_4Line_Ok.json',
                                             {'4Line_Label': 'Txt_Sell_Ok1'}, False,
                                             [('text', 'Txt_Sell_Ok1', ''),
                                              ('opts', 'Txt_Sell_Ok1', dict(y=112, height=40))]
                                             + obtain_plates(480, 325)),
    # Dettaglio medaglia da Medal List: carica SlideMedalInfoScene_ver341 sopra
    # MedalInfoScene e aggiunge un pulsante al primo figlio di LeftUI e di RightUI (medaglia
    # precedente / successiva). Frecce come MedalInfo_Arrow01.json (Medal_Syn_Arrow01 punta a sinistra).
    # Il pulsante accetta i tocchi in un rettangolo grande quanto il pannello
    # ma centrato sulla sua origine (angolo in basso a sinistra): l'origine sta quindi al
    # centro della freccia, e la freccia in (0,0).
    # Layout originali con i testi in giapponese: copie tradotte che sostituiscono
    # l'originale (resource_merge.py --last-wins). Conferma di Unequip nel dettaglio di
    # una medaglia equipaggiata (il pulsante prende il testo da text/ui/106180101).
    # Dopo Evolve il client riapre MedalInfoScene_ver320 come risultato e cerca
    # Panel_MixResult_Area nel layout R1, che l'ha solo la variante R3: crash. Si aggiungono
    # all'R1 originale i due pannelli vuoti dell'R3 (sostituzione, --last-wins).
    'MedalInfo_Information_R1.json': ('copy', 'MedalInfo_Information_R1.json', {}, False, [
        P('Panel_MixResult_Area', 486, 50, 562, 300),
        P('Tap_Screen_Area', 480, 15, 1, 1)]),
    # Pulsante Supernova in battaglia: l'icona SN dei filtri al posto della bussola SBurst_but01/02
    # (texture SBurst_SN_but01/02 di make_textures.py; sostituzione, --last-wins).
    # Layout WW (posizioni e animazioni del pulsante giuste) + l'ImageView «Medal» della revisione JP piu' recente,
    # dove mette img/medal/Medal_S_<imageId>.png della Supernova messa in coda (I-190): superburst_select_window.
    'ActionMap_SuperBurst_SelectWindow.json': ('func', 'superburst_select_window'),
    'MedalInfo_ReleaseWindow.json': ('copy', 'MedalInfo_ReleaseWindow.json', {}, False,
                                     [# Win_Over (9-slice) usa Panel07, assente da ogni risorsa: stesso
                                      # crash di Plate21 (vedi NO_PLATE21); finestra blu Win04
                                      ('tex', 'Win_Over', 'Win04.png', dict(capInsetsX=50, capInsetsY=60,
                                                                            capInsetsWidth=1, capInsetsHeight=200)),
                                      ('text', 'Txt_Title_Label', 'Unequip this Medal from where it is set.'),
                                      ('text', 'Txt_Cancel', 'Cancel')]),
    # Fumetti del Level Up (Camp_Balloon2, testo rosso scuro in dissolvenza ciclica): Txt_Announce
    # e' tarato sul giapponese a una riga (font 20, area 234x64 e 312x64 su tela 960x640); con
    # l'inglese ufficiale 101300064/65 (due righe, «Fuse the same Medals for» / «Fuse one more of
    # the same Medal») la prima riga andava a capo e l'ultima usciva dal fumetto (banco 14-10,
    # d14_lvup). Font 16: entrambe le righe stanno nelle aree originali (sostituzione, --last-wins).
    'MedalMix_GuiltMixBalloon1.json': ('copy', 'MedalMix_GuiltMixBalloon1.json', {}, False,
                                       [('opts', 'Txt_Announce', dict(fontSize=16))]),
    'MedalMix_GuiltMixBalloon2.json': ('copy', 'MedalMix_GuiltMixBalloon2.json', {}, False,
                                       [('opts', 'Txt_Announce', dict(fontSize=16))]),
    # Evolve: senza MedalEvoScene_ver320 restituisce null e il
    # client va in crash all'addChild. Nodi come nella ver260 (UnderUI, CenterUI_Left,
    # CenterUI_Right a x=480, LeftUI a y=576), ma Under e Left non esistono in nessuna
    # risorsa: generati con i widget che il codice cerca. UnderUI: Base_Money1/2 (con
    # Txt_Money, testi 100300002/100300003, e Txt_Money_Label), Button_LimitCut/
    # Txt_LimitCut (101400001), Button_Sell1/Txt_Sell1 (101100004), Txt_Wording
    # (101400007). CenterUI_Left: Dummy_Medal1/Star_Area1 (prima) e Dummy_Medal2/
    # Star_Area2 (dopo).
    'MedalEvoScene_ver320.json': ('scene', [('UnderUI', 'publish/MedalInfo_Evo_Under_Gen.json'),
                                            ('CenterUI_Left', 'publish/MedalInfo_Evo_Left_Gen.json'),
                                            ('CenterUI_Right', 'publish/MedalInfo_Evo_Right_Gen.json', 480, 0),
                                            ('LeftUI', 'publish/MedalSell_Back.json', 0, 576)]),
    # Statistiche prima/dopo: la ver260 originale, ma tre texture non esistono in nessuna
    # risorsa (ImageViewReader va in crash): Medal_Evo_Win e Medal_Evo_Attribute sostituite
    # con le texture dei riquadri del dettaglio medaglia, in 9-slice con gli stessi bordi di
    # MedalInfo_InfoWindow (Medal_Detail_Field 200/90, Plate02 50/0); MD_Guilt4_On nascosta.
    # Stile di riferimento: reference\medal_evolve\web_tumblr_evolve1.png (client 2015).
    # Etichette giapponesi tradotte.
    'MedalInfo_Evo_Right_Gen.json': ('copy', 'MedalInfo_Evo_Right_ver260.json', {}, False, [
        ('tex', 'Base_MedalInfo2', 'Medal_Detail_Field.png',
         dict(scale9Enable=True, capInsetsX=200, capInsetsY=90, capInsetsWidth=1, capInsetsHeight=1,
              scale9Width=373, scale9Height=153)),
        ('tex', 'Plate4', 'Plate02.png',
         dict(scale9Enable=True, capInsetsX=50, capInsetsY=0, capInsetsWidth=1, capInsetsHeight=1,
              scale9Width=352, scale9Height=30, height=30)),
        ('tex', 'Guilt_Icon', None),
        ('text', 'ATk', 'STR'), ('text', 'DEF', 'DEF'),
        ('text', 'Burst', 'Special Attack'), ('text', 'BurstName_Label', ''),
        ('text', 'Ability', 'Ability'), ('text', 'BurstCost', 'Required Gauges'),
        # aggiunti dopo la ver260: riquadri del Kakusei (skill
        # di risveglio) e del Super Attack, cloni nascosti del riquadro dello speciale
        ('clone_r', 'Base_MedalInfo2', 'Base_KakuseiSkill', 'Panel_1',
         {'BurstName_Label': 'KakuseiSkillName_Label'}),
        ('clone_r', 'Base_MedalInfo2', 'Base_SuperBurst', 'Panel_1',
         {'BurstName_Label': 'SuperBurstName_Label', 'Burst': 'Txt_SuperBurstTitle'}),
        ('add', 'Base_SuperBurst', L('Txt_Ticker_SuperBurst', -150, -60, 300, 24, '', 16))]),
    # Disposizione dal riferimento reference\medal_evolve\evolve.png: medaglie grandi prima e
    # dopo con la doppia freccia in mezzo, stelle sotto ciascuna, materiali grandi in fila
    # con «Held N», barra in basso come quella del Level Up (MedalInfo_Mix_ver340).
    'MedalInfo_Evo_Left_Gen.json': ('build', P('Panel_Evo_Left', 0, 0, 480, 640, [
        # Dummy_Medal1/2 sono ImageView: il codice vi carica l'immagine della medaglia
        # (loadTexture); da Panel il client va in crash. Immagini Medal_L
        # 640x640 con la medaglia al centro, scala 0,7; a schermo il centro della medaglia
        # cade (-428, -410)·scala px dalla posizione data (misurato sul banco a 0,3 e 0,42).
        I('Dummy_Medal1', 238, 220, 140, 170, 'Plate01.png', scale=0.7),
        I('Dummy_Medal2', 584, 220, 140, 170, 'Plate01.png', scale=0.7),
        I('Arrow_Evo', 233, 379, 113, 170, 'Medal_Evo_Arrow01.png', s9=False, scale=0.9),
        # stelle (scala 0,75): centrate nell'area, che sta sotto la medaglia
        P('Star_Area1', -88, 256, 300, 30),
        P('Star_Area2', 259, 256, 300, 30)])),
    # Area: i materiali richiesti, un pannello MedalInfo_Evo_Medal ogni 110 px.
    # Barra in basso con le misure del Level Up: Button_LimitCut e Button_Sell1 sono
    # immagini (il codice vi aggiunge il pulsante But01 / But06 e i testi «Evolve» e
    # «Sell Medals»), Base_Money1/2 = Required / Munny con l'icona Icon_Prize.
    'MedalInfo_Evo_Under_Gen.json': ('build', P('Panel_Evo_Under', 0, 0, 960, 640, [
        P('Area', -40, 80, 600, 150),
        I('Button_LimitCut', 80, 47, 158, 68, 'But01_Off.png', children=[
            L('Txt_LimitCut', 0, 2, 150, 58, 'Evolve', 30)]),
        # i figli di un ImageView si posizionano rispetto al suo centro
        I('Base_Money1', 295, 64, 270, 25, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_Money', -82, 0, 85, 24, 'Required', 16),
            I('Icon_Money', -25, 0, 30, 30, 'Icon_Prize.png', scale=0.5, s9=False),
            L('Txt_Money_Label', 66, 0, 138, 24, '0', 18)]),
        I('Base_Money2', 295, 34, 270, 25, 'Plate03.png', opts=PLATE3, children=[
            L('Txt_Money', -82, 0, 85, 24, 'Munny', 16),
            I('Icon_Money', -25, 0, 30, 30, 'Icon_Prize.png', scale=0.5, s9=False),
            L('Txt_Money_Label', 66, 0, 138, 24, '0', 18)]),
        I('Button_Sell1', 491, 49, 119, 58, 'But06_Off.png', children=[
            L('Txt_Sell1', 0, 2, 110, 54, 'Sell Medals', 20)]),
        L('Txt_Wording', 770, 48, 380, 30, '', 18)])),
    # Materiale richiesto da Evolve (riempito): in Medal_S il
    # codice aggiunge l'icona (medalView) e lo ridimensiona; Possession e' un contenitore con
    # Label_9 (testo 101399490) e Num_Label (quantita' posseduta), entrambe con ombra
    # (crash se mancano). L'icona (medalView) ha sotto la sua targhetta scura
    # del livello, vuota: come nell'originale «Held N» ci sta sopra (centro dell'icona a
    # (55,95) del pannello, targhetta a y=40, misurati sul banco). Dietro, il cerchio dello
    # slot del Level Up (Medal_Syn_Panel).
    'MedalInfo_Evo_Medal.json': ('build', P('Panel_Evo_Medal', 0, 0, 104, 150, [
        I('Slot_Ring', 55, 95, 146, 147, 'Medal_Syn_Panel.png', scale=0.72),
        P('Medal_S', 2, 22, 100, 96),
        P('Possession', 5, 30, 100, 20, [
            L('Label_9', 26, 10, 60, 20, 'Held', 15),
            L('Num_Label', 78, 10, 30, 20, '0', 15)])])),
    'SlideMedalInfoScene_ver341.json': ('scene', [('LeftUI', 'publish/SlideMedalInfo_Left.json'),
                                                  ('RightUI', 'publish/SlideMedalInfo_Right.json')]),
    'SlideMedalInfo_Left.json': ('build', P('Panel_Left', 30, 320, 120, 220, [
        I('Arrow01', 0, 0, 56, 134, 'Medal_Syn_Arrow01.png')])),
    'SlideMedalInfo_Right.json': ('build', P('Panel_Right', 930, 320, 120, 220, [
        I('Arrow01', 0, 0, 56, 134, 'Medal_Syn_Arrow01.png', flipX=True)])),
    # Popup Sort di Medal List: la ver350 e' la ver320 originale
    # piu' la sezione Dummy_Sb (filtro Super Burst; il codice la nasconde spostando le altre
    # della sua altezza: qui alta 0) e i filtri aggiunti dopo, cloni nascosti di quelli
    # vicini (nomi letti dallo stack al crash, dump mls2).
    'PopupNormal_SortButton_ver350.json': ('copy', 'PopupNormal_SortButton_ver320.json', {}, False, [
        P('Dummy_Sb', 0, 0, 0, 0),
        ('clone', 'Panel_TitleSkill', 'Panel_TitleSb', 'Dummy_Sb'),
        ('clone', 'Txt_TitleSkill', 'Txt_TitleSb', 'Dummy_Sb'),
        ('clone', 'Filter_Exp', 'Filter_SbPlus', 'Dummy_Sb'),
        ('clone', 'Filter_Exp', 'Filter_SbPlusPlus', 'Dummy_Sb'),
        ('clone', 'Filter_Single', 'Filter_Sb_Single', 'Dummy_Sb'),
        ('clone', 'Filter_All', 'Filter_Sb_All', 'Dummy_Sb'),
        ('clone', 'Filter_Random', 'Filter_Sb_Random', 'Dummy_Sb'),
    ] + [('clone', 'Filter_Ability%s' % n, 'Filter_Sb%s' % n, 'Dummy_Sb')
         for n in ('01', '02', '03', '04', '05', '06', '07', '08', '09', '12')]
      + [('clone', 'Filter_Ability_Recovery', 'Filter_Sb_' + n, 'Dummy_Sb')
         for n in ('Guard', 'BaseAttack', 'BaseDefence', 'NotSet', 'Recovery', 'Special', 'Recovery2',
                   'AttackOnly')]
      + [('clone', 'Filter_Ability_AtTime1', 'Filter_Sb_Timing%d' % n, 'Dummy_Sb') for n in range(1, 8)]
      + [('clone', 'Txt_SubTitle01', 'Txt_SubTitleSb01', 'Dummy_Sb'),
         ('clone', 'Txt_SubTitle02', 'Txt_SubTitleSb02', 'Dummy_Sb'),
         ('clone', 'Filter_Ability_Recovery', 'Filter_Ability_BaseAttack', 'Dummy_Ability'),
         ('clone', 'Filter_Ability_Recovery', 'Filter_Ability_BaseDefence', 'Dummy_Ability'),
         ('clone', 'Filter_Ability_Recovery', 'Filter_Ability_Guard', 'Dummy_Ability'),
         ('clone', 'Filter_Ability_Use6', 'Filter_Ability_Use7', 'Dummy_Ability'),
         ('clone', 'Filter_Ability_AtTime4', 'Filter_Ability_AtTime5', 'Dummy_Ability'),
         # tier 10 (182 medaglie): accanto al 9 (passo 109), visibile, icona MedalInfo_Guilt10
         ('clone', 'Filter_Guilt9', 'Filter_Guilt10', 'Dummy_Guilt'),
         ('opts', 'Filter_Guilt10', {'x': 185, 'visible': True}),
         ('tex', 'Filter_Guilt10/Logo_01', 'MedalInfo_Guilt10.png'),
         ('clone', 'Filter_RareStarSet7', 'Filter_RareStarSet8', 'Dummy_Filter')]
      + [('clone', 'Filter_Evo', 'Filter_Sb', 'Dummy_Sb')]   # cercato dentro Dummy_Sb (00a482ac)
      + [('clone', 'Filter_Evo', n, 'Dummy_Filter') for n in ('Filter_Subslot', 'Filter_Trait', 'Filter_Evo_Set')]),
    # Sub-slot del keyblade (I-066: Equipment > «Subslot» =
    # ). La scena ver340 non esiste: copia della ver310 originale (subslot_scene) con
    # Set_Medal nuovo. Il codice cerca dalla radice (ricorsivo): DeckEdit_SubSlot_Select_Medal (nodo)
    # > Win_under > Scroll_Area (vi crea MiniMedalScrollView), DeckEdit_SubSlot_Set_Medal (nodo) >
    # Win_under > Scroll_Area (vi crea KeybladeSubslotMedalView, celle DeckEdit_SubSlotMedal_ver260),
    # SubSlot_UpArrowEff (nodo armatura della scena), BestButton > Txt_Best (testo 106180100
    # «Optimize»), Txt_NotExist (106140376 «No available Medals.»), Close_Button, Panel_34 >
    # Txt_Subslot_Caution_Label (106140377); nel nodo Set_Medal Txt_KeyBlade_Label (nome del
    # keyblade), Txt_SubSlot_Rate (106140371 «Multipliers»), Txt_SubSlot_Num (106140374 «Equipped
    # Slots»), Txt_KeyBlade_Lv_Rate_Label («x%01.1f» = subslotRate del keyblade). Ad ogni cambio
    # scrive Txt_SubSlot_Rate_Label («+%01.3f») e Txt_SubSlot_Num_Label (106140352,
    # «n/120») nel Set_Medal, mette l'armatura EFFECT (freccia su) in Win_under > panel quando il
    # moltiplicatore sale e fa lampeggiare Panel_34 se gli slot non sono riempiti in ordine.
    # Disposizione da reference\subslot (JP 2018): a sinistra «SUBSLOT», keyblade, moltiplicatore
    # e «Slot» n/120 sopra la griglia a 3 colonne; a destra «SUBSLOT MEDALS» con le medaglie 7★.
    'DeckEditSubSlotScene_ver340.json': ('func', 'subslot_scene'),
    'DeckEdit_SubSlot_Set_Medal_ver340.json': ('build', P('Panel_1', 0, 0, 525, 640, [
        I('Win', 262, 572, 515, 130, 'Panel04.png', opts=GRID),
        L('Txt_Title', 18, 612, 250, 36, 'SUBSLOT', 32, opts=dict(anchorPointX=0)),
        I('Img_KeyBlade', 155, 568, 290, 30, 'Plate03.png', opts=PLATE3),
        L('Txt_KeyBlade_Label', 22, 568, 220, 28, '', 20, opts=dict(anchorPointX=0)),
        L('Txt_KeyBlade_Lv_Rate_Label', 292, 568, 60, 28, 'x1.0', 18, opts=dict(anchorPointX=1)),
        L('Txt_SubSlot_Rate', 420, 605, 170, 24, 'Multipliers', 18),
        L('Txt_SubSlot_Rate_Label', 420, 570, 170, 34, '+0.000', 30,
          opts=dict(colorR=255, colorG=230, colorB=60)),
        I('Img_SubSlot_Num', 262, 522, 505, 28, 'Plate03.png', opts=PLATE3),
        L('Txt_SubSlot_Num', 30, 522, 240, 26, 'Equipped Slots', 18, opts=dict(anchorPointX=0)),
        L('Txt_SubSlot_Num_Label', 495, 522, 140, 26, '0/120', 20, opts=dict(anchorPointX=1)),
        # griglia: figli di un ImageView relativi al centro (abs. 12..512 x 7..497)
        I('Win_under', 262, 252, 515, 500, 'Panel04.png', opts=GRID, children=[
            P('Scroll_Area', -250, -245, 500, 490),
            P('panel', 158, 318, 10, 10)])])),
    # Pannello delle medaglie 7★ (nome della scena ver310, assente dalle risorse; la ver260 servita
    # ha un 9-slice su Panel20 che non esiste). Close_Button e BestButton cercati dalla radice.
    'DeckEdit_SubSlot_Select_Medal_ver310.json': ('build', P('Panel_1', 0, 0, 430, 640, [
        I('Win_under', 215, 320, 420, 630, 'Panel04.png', opts=GRID, children=[
            P('Scroll_Area', -200, -235, 400, 495),
            L('Txt_Title', -195, 288, 300, 30, 'SUBSLOT MEDALS', 24, opts=dict(anchorPointX=0)),
            B('Close_Button', 180, 288, 70, 70, 'But_Close')]),
        B('BestButton', 215, 45, 220, 68, 'But06', 'Optimize', 24, label='Txt_Best', opts=BUTS),
        L('Txt_NotExist', 215, 340, 380, 60, 'No available Medals.', 22, visible=False)])),
    # Avviso «Medals must be set in order.» (nodo SubSlot_Caution della scena in 379,470): Panel_34
    # nascosto; (se uno slot vuoto precede uno pieno) gli mette opacita' 0, lo mostra e
    # lo fa comparire e svanire (FadeIn, attesa, FadeOut) senza spostarlo: la posizione e' quella del
    # layout. Nella ver310 originale la griglia occupava tutta l'altezza; qui (Set_Medal ver340 con
    # l'intestazione) va sulla barra «Equipped Slots» (assoluto 262,526, 500x40: y 506..546, sopra il
    # bordo di Win_under a 502), cosi' non copre la prima riga di slot (banco sb_3). Il testo 106140377
    # e' su due righe («Medals must be» / «set in order.»): alta 56, centrata sulla barra (banco 12-10
    # sd_4: con 36 si vedeva solo la prima riga). Sfondo: Plate03 qui non si disegna (sd_c1, testo
    # sopra «Equipped Slots»), quindi la targhetta opaca Subslot_InfoPlate (116x26) ingrandita.
    'DeckEdit_Subslot_Caution_ver260.json': ('build', P('Panel_Caution', 0, 0, 10, 10, [
        P('Panel_34', -367, 28, 500, 56, [
            I('Img_Caution', 250, 28, 116, 26, 'Subslot_InfoPlate.png', s9=False,
              opts=dict(scaleX=500 / 116, scaleY=56 / 26)),
            L('Txt_Subslot_Caution_Label', 250, 28, 480, 52, 'Medals must be\nset in order.', 19)],
          visible=False)])),
    # Cella di un sub-slot (la carica, 164x154;
    # e la riempiono). Cerca (ricorsivo, tutti obbligatori tranne MatchSlotLWF):
    # Medale (tocco spento, visibile), SubSlot_Route_LR/LR1/LR2 (linea verso la cella a destra:
    # base, slot dopo vuoto, slot dopo pieno) e UD/UD1/UD2 (verso la riga sotto, righe a serpentina),
    # MedalBase (ImageView: «img/ui/Subslot_MedalSlot%03d.png» con la category del keyblade; vi
    # aggiunge la LWF MatchSlotLWF), Slot, SlotNum (TextAtlas: numero dello slot), InfoPanel, TYpe
    # (img/ui/Deck_Medal%d, bagliore dell'attributo), Icon_Type (KeyBlade_type_%02d), Icon_Type_1
    # (Deck_Mark_Uplight/Reverse), Medal_S (immagine della medaglia), Txt_Mag_Label («+%01.3f» =
    # bonus del tier), Guilt_Icon (img/ui/guilt/Guilt%d_num_draw), Cursor (vi crea l'armatura
    # Z_SpCursor, cursor_anim, sullo slot da riempire). Aspetto da reference\subslot\subslot_JP_3.
    # Medal_S: vi carica la Medal_S della medaglia (190x190 come Medal
    # di DeckEdit_SmallMedal_ver330) senza cambiarne la misura: ignoreSize, scala 1 = medaglia
    # intera che esce dal disco come in subslot_JP_1 (con 89x109 non ignorati era rimpicciolita).
    # Visibile nel layout: il trascinamento da uno slot crea con una
    # copia della cella (nasconde Route, MedalBase, Slot, SlotNum, InfoPanel, TYpe), carica la
    # medaglia in Medal_S, la scala 1.5 e la mette sopra la scena, ma non chiama setVisible su
    # Medal_S: nascosto dal layout, nessuna medaglia seguiva il dito (banco sb_4). Gli slot vuoti
    # lo nascondono da se' (setVisible 0 se l'id e' 0).
    'DeckEdit_SubSlotMedal_ver260.json': ('build', P('Panel_SubSlotMedal', 0, 0, 164, 154, [
        I('SubSlot_Route_LR', 164, 92, 64, 12, 'Subslot_Route.png', s9=False,
          opts=dict(colorR=90, colorG=100, colorB=150)),
        I('SubSlot_Route_LR1', 164, 92, 64, 12, 'Subslot_Route.png', s9=False,
          opts=dict(colorR=200, colorG=140, colorB=210)),
        I('SubSlot_Route_LR2', 164, 92, 64, 12, 'Subslot_Route.png', s9=False,
          opts=dict(colorR=255, colorG=70, colorB=160)),
        I('SubSlot_Route_UD', 82, 0, 64, 12, 'Subslot_Route.png', s9=False,
          opts=dict(rotation=90, colorR=90, colorG=100, colorB=150)),
        I('SubSlot_Route_UD1', 82, 0, 64, 12, 'Subslot_Route.png', s9=False,
          opts=dict(rotation=90, colorR=200, colorG=140, colorB=210)),
        I('SubSlot_Route_UD2', 82, 0, 64, 12, 'Subslot_Route.png', s9=False,
          opts=dict(rotation=90, colorR=255, colorG=70, colorB=160)),
        P('Medale', 0, 0, 164, 154),
        I('MedalBase', 82, 90, 128, 128, 'Subslot_MedalSlot001.png', s9=False),
        I('TYpe', 82, 90, 179, 179, 'Deck_Medal1.png', s9=False, scale=0.72),
        I('Slot', 82, 102, 74, 24, 'Deck_Slot.png', s9=False, opts=dict(colorR=170, colorG=175, colorB=190)),
        A('SlotNum', 82, 78, 'Mu_Num_Slot.png', 44, 29, '1', scale=0.7,
          opts=dict(colorR=190, colorG=195, colorB=210)),
        I('Medal_S', 82, 88, 190, 190, 'Medal_S_00000001.png', s9=False, ignoreSize=True, scale=0.78),   # 1.0 copriva le targhe della riga sopra (banco sc_1)
        P('InfoPanel', 12, 2, 140, 30, [
            I('base_Type', 70, 15, 116, 26, 'Subslot_InfoPlate.png', s9=False, opts=dict(scaleX=1.2)),
            I('Guilt_Icon', 12, 15, 57, 53, 'Guilt5_On.png', s9=False, scale=0.55, visible=False),
            L('Txt_Mag_Label', 68, 15, 80, 22, '+0.000', 18),
            I('Icon_Type', 126, 15, 42, 44, 'KeyBlade_type_01.png', s9=False, scale=0.7),
            I('Icon_Type_1', 126, 40, 42, 44, 'Deck_Mark_Uplight.png', s9=False, scale=0.6,
              visible=False)]),
        P('Cursor', 82, 90, 1, 1)])),
    # Riquadro del moltiplicatore sotto una medaglia del revolver in modalita' sub-slot (DeckRevolverView,
    # se la cella non ha SubslotInfoPanel carica questo layout, lo clona e lo
    # aggiunge ad Area_MedalInfo, 108x31, col nome SubslotInfoPanel; poi Icon_Type carica
    # KeyBlade_type_%02d e Txt_Mag_Label riceve il moltiplicatore). Come Dummy_Mag di
    # DeckEdit_RevolverMedal_ver330. Guilt_Icon: ci carica img/ui/guilt/Guilt%d_num_draw
    # (tier della medaglia) senza controllo del null: senza, crash al tocco di «Subslot» (banco v33).
    # Lo stesso pannello va nelle celle della lista SUBSLOT MEDALS (celle 120x164 fisse): il client
    # crea per ogni cella una medaglia piccola (
    # DeckEdit_SmallMedal_ver330 originale + DeckEdit_Deck_MedalInfo_ver260 in Area_MedalInfo); il
    # in quel modo carica img/ui/Minfo_Pet01.png (assente) in Icon_1 e
    # scrive in Txt_1 «×%01.3f» (106140350), poi aggiunge SubslotInfoPanel con «+%01.3f» (106140372):
    # SubslotInfoPanel deve coprire tutto Area_MedalInfo (108x31) con una targhetta opaca, altrimenti
    # si leggeva «×+0.030» (banco sb_2). Disposizione come subslot_JP_1: tier a sinistra (dentro la
    # cella: a x -8 era tagliato dal bordo della lista), «+0,005» al centro, attributo a destra.
    'DeckEdit_SubSlot_MedalInfo_ver260.json': ('build', P('SubslotInfoPanel', 0, 0, 108, 31, [
        I('base_Type', 54, 15, 116, 26, 'Subslot_InfoPlate.png', s9=False),
        I('Guilt_Icon', 9, 15, 57, 53, 'Guilt5_On.png', s9=False, scale=0.55, visible=False),
        L('Txt_Mag_Label', 56, 15, 64, 22, '+0.000', 17),
        I('Icon_Type', 98, 15, 42, 44, 'KeyBlade_type_01.png', s9=False, scale=0.6)])),
    # Dialog del pet «SPIRIT» (PetInfoDialog, I-076/I-077): icona del pet della home e «Swap Gear»
    # (Button_PowerUp di DeckEdit_PetMedal_ver230) chiamano open che
    # carica cocostudio/publish/PetInfoScene_ver320.json (assente: NULL, crash 0x170 dentro
    # ritorno). Dettagli e nomi in pet_info_scene.
    # e' il (come per MedalListScene): la scena ha un nodo CenterUI col
    # GUIComponent del layout generato; cerca i widget attraverso i nodi (banco 12-10:
    # letto come layout puro -> SIGSEGV 0x0 nel SceneReader).
    'PetInfoScene_ver320.json': ('scene', [('CenterUI', 'publish/PetInfo_Gen_ver320.json')]),
    'PetInfo_Gen_ver320.json': ('func', 'pet_info_scene'),
    # Sotto-schermate del dialog SPIRIT (I-082), assenti da ogni risorsa.
    # «Name» (Button_A): popup del nome, vedi pet_rename_popup.
    'PetInfo_Rename_ver230.json': ('func', 'pet_rename_popup'),
    # Riga della lista dei Tricks (scroll init cella 304x68 =,
    # nodo con ancora (0.5, 0.5) = il layout va in «mainPanel» a
    # (152, 0) = meta' larghezza: i due mezzi si annullano e l'origine del layout cade sul bordo
    # SINISTRO della cella, x 0 della lista). Banco 12-10 (pt_t1): con la riga centrata
    # sull'origine meta' riga usciva a sinistra della lista, tagliata. Contenuto quindi da 0 a 304
    # (centro a x 152), in basso a y 0..68 (centro 34, gia' giusto al banco). La cella
    # cerca PetSkill_Panel (se manca esce), vi scrive Txt_PetSkill (nome del trick,
    # Label obbligatoria), mostra Icon_New (trick non ancora visto;
    # obbligatoria) e, se in PetSkill_Panel non c'e' SkillButton, ne crea uno (
    # «But13», da NON mettere nel layout) che usa PetSkill_Panel come immagine:
    # vi carica img/ui/But13_Off.png con quindi
    # PetSkill_Panel deve essere un ImageView (But13 non esiste: copia di But16 in COPIES). Al tocco
    # il dettaglio del dialog. Aspetto: pulsante blu But16 col nome.
    'PetInfo_PetSkill_Panel_ver230.json': ('build', P('PetSkill_Panel_root', 0, 0, 304, 68, [
        I('PetSkill_Panel', 152, 34, 300, 52, 'But16_Off.png', opts=BUT16, ignoreSize=False, children=[
            L('Txt_PetSkill', 0, 2, 270, 30, '', 22),
            I('Icon_New', 118, 20, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.55, visible=False)])])),
    # Spirit Training: «Train» (e «Train Now» quando l'allenamento e' pronto) -> GET /pet/expedition
    # (243, parser) scelta delle medaglie
    # (initPetTrainingMedalSelectPanel), vedi pet_training_edit. «Training Slots»
    # -> 243 -> openPetTrainingSlotInfoPopup vedi
    # pet_training_slot_check. «Train Now» col tempo d'attesa
    # openPetTrainingRestartPopup (riavvio a jewel, PUT /pet/expedition/recover 245).
    # «Outfits» (Button_B): scena (init), parente dell'editor
    # dell'avatar (AvatarEditScene_ver131 + AvatarEdit_*: stessi nodi, nomi di pulsanti diversi).
    # Il codice cerca dalla radice della scena (figlio diretto, poi in profondita',
    # anche attraverso i nodi): CenterUI_Left, CenterUI_Right, Decision, MyCoordinate, tab1..tab6;
    # dentro CenterUI_Right KB_On, Avatar2, Pet, Pet2, Set_ChangeBut_New (facoltativo); dentro
    # CenterUI_Left Area e Txt_NoPet. Dettagli nelle funzioni pet_edit_*. Scena piatta: tutto
    # quello che va cercato dentro un nodo sta nel suo layout.
    'PetEditScene_ver230.json': ('scene', [('CenterUI_Left', 'publish/PetEdit_Win_Gen.json'),
                                           ('CenterUI_Right', 'publish/PetEdit_Right_Gen.json'),
                                           ('Decision', 'publish/PetEdit_Decision_Gen.json'),
                                           ('MyCoordinate', 'publish/PetEdit_MyCoordinate_Gen.json')]),
    'PetEdit_Win_Gen.json': ('func', 'pet_edit_win'),
    'PetEdit_Right_Gen.json': ('func', 'pet_edit_right'),
    'PetEdit_Decision_Gen.json': ('func', 'pet_edit_decision'),
    'PetEdit_MyCoordinate_Gen.json': ('func', 'pet_edit_coordinate'),
    'PetEdit_Panel_ver230.json': ('func', 'pet_edit_panel'),
    'PetEdit_Check2_ver230.json': ('func', 'pet_edit_check2'),
    'PetInfo_TrainingEdit_ver320.json': ('func', 'pet_training_edit'),
    'PetInfo_TrainingSlotCheck_ver320.json': ('func', 'pet_training_slot_check'),
    # animazione dopo «Train» (vedi pet_training_production): mancava -> crash in
    # GUIReader subito dopo la 244 e la 170 (I-082)
    'PetInfo_TrainingProduction.json': ('func', 'pet_training_production'),
    # Riavvio a jewel: Txt_Wording (ne fa un CustomRichText
    # «Xml_Txt_Wording» col testo 106200405 e i jewel richiesti, pet: niente widget con quel
    # nome), Txt_CrownPossessed (100310001) e Txt_CrownPossessed_Label (jewel posseduti, somma dei
    # due contatori di userStone), Txt_Time (tempo rimasto, aggiornato),
    # Button_Close/Txt_Cancel e Button_Ok/Txt_Ok (con la k minuscola). Dal popup OK/Annulla
    # originale come le conferme a jewel del Moogle Shop.
    'PetInfo_TrainingRestartPop_ver320.json': ('copy', 'PopupNormal_Text_34_4Line_OkCancel.json',
                                               {'4Line_Label': 'Txt_Wording', 'Button_OK': 'Button_Ok',
                                                'Txt_OK': 'Txt_Ok'}, False,
                                               [('text', 'Txt_Wording', ''), ('opts', 'Txt_Wording', dict(y=85, height=90))]
                                               + held_plates(312)[:3]
                                               + [L('Txt_Time', 480, 268, 560, 28, '', 20,
                                                    opts=dict(colorR=255, colorG=230, colorB=60))]),
    # Animazioni Armature (.ExportJson) mancanti: senza file la creazione dell'armatura
    # va in crash. Copia di ArrowAnim con armatura e movimento rinominati.
    # Cursor_Anim_MedalSell: segno di selezione delle medaglie nella vendita (
    # movimento Animation1; lo mostra sulle celle scelte). Nell'originale e' un
    # riquadro bianco arrotondato (reference\medal_list\web_reddit_sell_playingcard.jpg):
    # la cornice bianca con alone del Partner (Deck_Partner_Plate_Cursor 346x122) ricomposta
    # in 9-slice con 8 ossa (frame_armature), 140x176 centrata come il vecchio bagliore.
    # Il client legge solo i plist che esistono gia' nelle risorse originali (provato: un plist
    # con un nome nuovo non si carica, anche identico all'originale). Il nostro sostituisce
    # quello di EquipmentBGAction, armatura che il codice non cita mai (resource_merge
    # --last-wins).
    'Cursor_Anim_MedalSell.ExportJson': ('frame', 'Cursor_Anim_MedalSell', 'Cursor_Anim_Partner0.png',
                                         (346, 122), 40, 140, 176, (2, 9), 'EquipmentBGAction0.plist'),
    # MedalSelectAnimation: selezione delle medaglie (movimento Medal_Select01).
    'MedalSelectAnimation.ExportJson': ('armature', 'ArrowAnim.ExportJson', 'MedalSelectAnimation',
                                        {'Left': 'Medal_Select01', 'Right': 'Animation1'}),
}


# Testi dell'interfaccia mancanti: text/ui/<id>.txt, letti (categoria 0 =
# ui); senza file il risultato e' NULL e la schermata va in crash. Quasi tutti arrivano
# originali dal pacchetto misc dell'IPA 4.4.0 (import_ui_texts.py, copiati dopo questi e
# quindi prevalenti); qui solo quelli che li' mancano, dalle immagini di riferimento
# (reference\) o dall'equivalente Dark Road.
TEXTS = {
    # Moogle Shop, testi aggiunti con i trait a Munny (4.1.0, assenti anche dall'IPA 4.4.0):
    # Txt_Munnies accanto ai Munny posseduti (nel video JP «所持マニー») e la
    # conferma del trait («マニー5000000を消費して覚醒能力をつけます。»),
    # sul modello del testo a jewel 106220409
    106260102: 'Munny',
    106260101: 'Setting this trait will cost <important>${1:%d}</important> Munny.',
    # Presents
    103500013: 'Presents can be collected here.\nPresents over the limit of 200 will be deleted,\n'
               'oldest first, as will those past their expiry date.',   # Txt_Wording
    103500002: 'Presents',      # Txt_Stock_Title
    103500003: 'Collect All',   # Txt_ReceiveAll (Button)
    106250104: 'Other',         # Txt_Stock (Dark Road: その他)
    106250103: 'Jewels',        # Txt_Stock_2 (Dark Road: ジュエル)
    # Medal List (barra di aiuto in alto; modalita' vendita)
    100620045: 'Tap a Medal to see its details.',
    # Sell Medals: titolo di Txt_A_Ticket (accanto a 106130301 «Jewels»)
    106240301: 'Tickets',
    # esito della vendita (Txt_Sell_Ok1; l'alternativa 100300009 e' «Complete!»)
    106240302: 'Sale complete!',
    # Menu Quests: sbloccato il Colosseo (Quest 130, stage 4100) scrive questo testo
    # in Txt_Title4 (poi nascosta): assente ovunque (anche nell'IPA 4.4.0) ->
    # crash (banco colmenu). Testo come 102850010 di Union Cross.
    102850008: 'Available quests!',
    # Spirit Training (slot bloccati; assenti anche
    # dall'IPA 4.4.0, testi nostri): 106240102 in Txt_Period del 4° slot (Jewel Box E, valido fino a
    # fine mese), 106270102 in Txt_Caution degli slot 2 e 4 quando l'acquisto non e' disponibile
    106240102: 'Valid until the end of the month',
    106270102: 'Not available\nat this time',
}
# Popup Sort, scheda Filter (etichette dei filtri):
# testi assenti ovunque (IPA 4.4.0 e JP 4.3.1: segnaposto «[id]»), nostri, nello stile delle
# sezioni normali e con i termini NA delle descrizioni («Pierces DEF boost», «SN Renew»).
# 206-208 = sezione Special Attacks (Filter_Ability_Guard/BaseAttack/BaseDefence), il resto =
# sezione Supernova (riga burst di superBurstId; vedi docs/notes/medaglie.md#filtri).
TEXTS.update({
    106240205: 'Types',          # Txt_SubTitleSb01: intestazione dei filtri d'effetto
    106240206: 'Pierce DEF', 106240207: 'Base STR', 106240208: 'Base DEF',
    106240209: 'Pierce DEF',     # Filter_Sb_Guard: penetrate > 0
    106240210: 'Base STR',       # Filter_Sb_BaseAttack: addBaseAtkSelf/Opponent != 0
    106240211: 'Base DEF',       # Filter_Sb_BaseDefence: addBaseDefSelf/Opponent != 0
    106240212: 'Single', 106240213: 'All', 106240214: 'Random',   # target 1/2/3
    106240215: 'None',           # Filter_Sb_NotSet: medaglia senza Supernova
    106240216: 'Heal',           # Filter_Sb_Recovery: heal/cure/recovery
    106240217: 'Special',        # Filter_Sb_Special: copia/azzeramento buff, contatore, riflesso
    106240218: 'SN Renew',       # Filter_Sb_Recovery2: recurringAttribute > 0
    106240219: 'Attack Only',    # Filter_Sb_AttackOnly
    106240220: 'PvP Timing',     # Txt_SubTitleSb02: superburstTiming 1-7 («Triggers before slot N»)
})
TEXTS.update({106240220 + n: str(n) for n in range(1, 8)})


def node(name, tag):
    return {'classname': 'CCNode', 'name': name, 'canedit': True, 'objecttag': tag, 'rotation': 0,
            'scalex': 1, 'scaley': 1, 'visible': 1, 'x': 0, 'y': 0, 'zorder': 1,
            'gameobjects': [], 'components': []}


def scene(names):
    """names: 'Nome' (nodo vuoto), ('Nome', 'publish/layout.json') (nodo con GUIComponent)
    o ('Nome', 'publish/layout.json', x, y) (nodo spostato, come nelle scene originali)."""
    root = node(None, 10000)
    root['gameobjects'] = []
    for i, n in enumerate(names):
        name, ui, x, y = (n, None, 0, 0) if isinstance(n, str) else (tuple(n) + (0, 0))[:4]
        g = dict(node(name, 10001 + i), **{'__type': 'ComGameObjectSurrogate:#EditorCommon.JsonModel'})
        g.update(x=x, y=y)
        if ui:
            g['components'] = [{'__type': 'ComGUIAdapterSurrogate:#EditorCommon.JsonModel.Component',
                                'classname': 'GUIComponent', 'name': 'GUIComponent', 'file': None,
                                'fileData': {'path': ui, 'plistFile': '', 'resourceType': 0}}]
        root['gameobjects'].append(g)
    root.update({'CanvasSize': {'_height': 640, '_width': 960}, 'Triggers': None, 'Version': '1.6.0.0',
                 'components': [{'__type': 'ComSceneSurrogate:#EditorCommon.JsonModel.Component',
                                 'classname': 'CCScene', 'name': 'CCScene', 'scenename': 'generated'}]})
    return root


def find(w, name):
    if '/' in name:                     # 'Padre/Figlio': il figlio dentro quel widget
        head, rest = name.split('/', 1)
        return find(find(w, head), rest)
    if w.get('options', {}).get('name') == name:
        return w
    for c in w.get('children', []):
        hit = find(c, name)
        if hit:
            return hit
    return None


def clone(tree, src, name, parent, visible=False):
    """Copia del widget src (con i figli) chiamata name, aggiunta a parent: per i widget che
    il codice cerca e un layout piu' vecchio non ha (CheckBox e simili, stessa classe)."""
    w = json.loads(json.dumps(find(tree, src)))
    w['options']['name'] = w['name'] = name
    w['options']['visible'] = visible
    find(tree, parent)['children'].append(w)


def rename(w, mapping):
    o = w.get('options', {})
    if o.get('name') in mapping:
        o['name'] = mapping[o['name']]
    for c in w.get('children', []):
        rename(c, mapping)


TEXTURES = set(open(os.path.join(SRC, '..', 'textures.txt'), encoding='utf-8-sig').read().split())

# File gia' presenti nelle risorse sotto un altro percorso, copiati (estratti con res_get.py in
# <cartella layout estratti>) dove il client li cerca: destinazione -> sorgente.
# - img/ui/<pulsante>_On/_Off/_Disable: i pulsanti caricano
# «img/ui/%s_On.png» al tocco; 46 varianti esistono solo in
#    cocostudio/publish (es. But06_On: crash toccando «Sell Medals» in Evolve e Level Up);
#  - icone delle valute (img/incentive/IncentiveIcon_NN: 04 munny, 14 Avatar Coin) accanto ai
#    layout, per gli ImageView della vendita. Il jewel NON si copia: in cocostudio/publish la
#    numerazione e' diversa (01 = jewel, servito WW; 02 = munny nei dati JP, che
#    import_jp_coco.py scrive sopra la copia: righe Items del Moogle Shop col munny, I-122).
#    I layout generati usano IncentiveIcon_01.png per il jewel.
COPIES = {'cocostudio/publish/' + n: 'img/incentive/' + n
          for n in ('IncentiveIcon_04.png', 'IncentiveIcon_14.png')}
# icone che il popup Sort/Filter (PopupNormal_SortButton_ver350) cerca accanto ai layout ma
# che esistono solo sotto img/: Guilt 2-8 (img/ui/guilt) e risvegli (img/kakusei)
COPIES.update({PUB + 'MedalInfo_Guilt%d.png' % i: 'img/ui/guilt/MedalInfo_Guilt%d.png' % i for i in range(2, 9)})
# «Exchange» del Moogle Shop: al tocco il pulsante carica img/ui/But30_On/Off (assenti:
# crash, stack mg9); rosso come nell'originale (moogle_shop_01.png) = But01
COPIES.update({'img/ui/But30_%s.png' % s: PUB + 'But01_%s.png' % s for s in ('Off', 'On')})
# Banner della scheda Events: ImageButton But15 di «Details» (al tocco carica
# img/ui/But15_On, che esiste solo come dark_But15_On), lucchetto e icona di completamento
# caricati da img/ui (assenti: dal lucchetto di cocostudio e da AchievedComplete; ShopBut_Lock_Disable
# lo scrive make_shop_lock.py, I-133)
COPIES.update({'img/ui/But15_On.png': PUB + 'dark_But15_On.png', 'img/ui/QuestBut_Lock.png': PUB + 'QuestBut_Lock.png',
               'img/ui/Complete_icon1.png': PUB + 'AchievedComplete.png',
               'img/ui/Complete_icon2.png': PUB + 'AchievedComplete.png'})
COPIES.update({PUB + 'Kakusei_Icon%s.png' % n: 'img/kakusei/Kakusei_Icon%s.png' % n
               for n in ('0010', '0030', '0040', '0050', '0060', '0061', '0070', '0080')})
# PassiveResult (popup «nuova passiva», dopo PUT /passive/list isList 0): l'ImageView
# Panel_Passive ha il 9-slice su Result_Clear_Challenge_Panel01B.png, assente da ogni risorsa: crash
# in GUIReader (SIGSEGV 0x2c, I-078: Treasure Trove +35 = prima passiva 301350). Copia della 01.
COPIES[PUB + 'Result_Clear_Challenge_Panel01B.png'] = PUB + 'Result_Clear_Challenge_Panel01.png'
# Righe dei Tricks del pet (PetInfo_PetSkill_Panel_ver230): il pulsante «But13» creato dal codice
# carica img/ui/But13_Off (e _On/_Disable) nell'ImageView della riga; But13 non esiste in nessuna
# risorsa: il pulsante blu But16 (come Play Style)
COPIES.update({'img/ui/But13_%s.png' % s: PUB + 'But16_%s.png' % s for s in ('Off', 'On', 'Disable')})
# Moogle Shop: l'animazione del moogle (lwf/mogshop/mog_wait) non esiste; LWF vuoto come
# per gli NPC e il pet (restituisce NULL se manca: crash). LWF vuoto = empty_lwf.py
# (nostro, un fotogramma, scritto in memoria a ogni build: nessun file in git)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import empty_lwf  # noqa: E402
empty_lwf.write(os.path.join(OUT, 'lwf', 'mogshop', 'mog_wait', 'mog_wait.lwf'))
# Potenziamento del keyblade (POST /keyblade/enhance, server/keyblade-evo.js), LWF assenti da
# ogni risorsa (nullo -> crash): risultato con slot nuovo (
# KeyEvo_Medal_01B col gestore enterFrame di _root, KeyEvo_eff, e sul movie
# «medal_blank_slot» medal_blank_slot1-3 = attributo 3/1/2), evoluzione
# del design (KeyBlade_Evolution, movie «keyblade_previous»/«keyblade», va
# avanti quando _root arriva all'ultimo fotogramma) e KeyBlade_StepUp.
# LWF vuoti: niente animazione ma il flusso prosegue (un fotogramma = subito alla fine).
for _p in [['memudemo', 'KeyBlade_Evolution'], ['memudemo', 'KeyBlade_StepUp'],
           ['keyblade', 'KeyEvo', 'KeyEvo_Medal_01B'], ['keyblade', 'KeyEvo', 'KeyEvo_Medal_02'],
           ['keyblade', 'KeyEvo', 'KeyEvo_eff']] + [['keyblade', 'KeyEvo', 'medal_blank_slot%d' % _i] for _i in (1, 2, 3)]:
    empty_lwf.write(os.path.join(OUT, 'lwf', *_p, _p[-1] + '.lwf'))
# Spirit Training (I-082), LWF assenti da ogni risorsa:
# - lwf/pet/demo/training_SE (suono dell'animazione PetInfo_TrainingProduction,
# NULL -> addChild(NULL) se manca): vuoto (un fotogramma = subito alla fine);
# - lwf/medal/Kakusei/Kakusei_Get1 e _Get2 (roulette e trait ottenuto /
#; anche il Moogle Shop) e Kakusei_Icon%04d: LWF NOSTRI di
#   make_pet_training_fx.py, con le texture delle vignette di PetInfo_TrainingProduction.
#   Prima Get1/2 erano vuoti: nessun trait nell'animazione, TAP SCREEN sul dettaglio della
#   medaglia e il trait solo dopo il tocco (segnalazione utente 12-10).
for _p in [['pet', 'demo', 'training_SE']]:
    empty_lwf.write(os.path.join(OUT, 'lwf', *_p, _p[-1] + '.lwf'))
import make_pet_training_fx  # noqa: E402
make_pet_training_fx.write_all(OUT, SRC)
TEXTURES |= set(make_pet_training_fx.TEXTURE_NAMES)
# Movimenti del pet (lwf/pet/motion/*): LWF nostri che animano le 9 parti servite di
# lwf/pet/part/001 (attaccate dal client ai movie omonimi), con l'evento «end» dove la
# battaglia aspetta la fine del movimento (I-005: con i vuoti la battaglia col pet si bloccava
# dopo il primo attacco), con il colpo in battle_normal/all/skill (turno della medaglia del pet),
# e gli effetti lwf/ability/hit_effect/pet_eff_0001-0003. Vedi make_pet_motions.py.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_pet_motions  # noqa: E402
make_pet_motions.write_all(OUT)
# Evoluzione del keyblade: LWF nostro al posto di quello vuoto scritto sopra (I-078).
import make_kb_evolution_lwf  # noqa: E402
make_kb_evolution_lwf.write_all(OUT)
# Animazioni della guilt (GuiltBonus, _result, _max, cifre Yfix/Rfix): originali JP 4.3.1 importati da
# import_jp_raisedraw.py nel pacchetto raisedraw_gen (19-10); make_guilt_bonus_lwf.py resta come ripiego.

# Animazione del risultato di Evolve (lwf/medal/compose/evolution/
# card_evolution_result_%02d, %02d = numero dei materiali): assente da ogni risorsa, il
# client va in crash dopo la risposta. Copia di quella del Level Up (card_strength_result_01)
# con LWF e texture rinominati (il nome delle texture comincia col nome del file LWF).
# Avatar Boards: apertura del nodo e premio/bacheca completata (
# gotoAndPlay su un'etichetta: con una LWF vuota crash dopo lo sblocco, banco v32), assenti da
# ogni risorsa: copie dell'animazione del premio dei risultati (Result_Reward), rinominate
# Texture delle copie (I-085): il LWF non si riscrive, e la sua tabella delle stringhe nomina le
# texture col nome COMPLETO dell'originale (card_strength_result_01_<hex>.png, Result_Reward_
# <hex>.png: il prefisso lo mette il convertitore, il client le cerca come <cartella del LWF>/
# <nome nel LWF>). Le PNG rinominate col nome della copia non le carica nessuno: il LWF gira
# (stessa durata, callback di fine) ma senza immagini, schermo fermo ~7 s (Evolve, banco 12-10).
# Si scrive quindi ogni PNG anche col nome originale nella cartella della copia.
def _lwf_copy(src_dir, dst_dir, old, new):
    for _f in os.listdir(os.path.join(SRC, *src_dir.split('/'))):
        COPIES[dst_dir + _f.replace(old, new)] = src_dir + _f
        if _f.endswith('.png'):
            COPIES[dst_dir + _f] = src_dir + _f


_RR = 'lwf/battleresult/Result_Reward/'
# con i dati JP locali le due animazioni originali le scrive import_jp_coco.py (JP_LWF):
# le copie restano solo come ripiego senza quei dati
_JP_SPHERE = private_tools.local_path('jp_data', 'lwf', 'sphere', 'SpIcon_Open')
if os.path.isdir(os.path.join(SRC, *_RR.split('/'))) and not os.path.isdir(_JP_SPHERE):
    for _n in ('SpIcon_Open', 'SphereMap_Complete'):
        _lwf_copy(_RR, 'lwf/sphere/%s/' % _n, 'Result_Reward', _n)
_LU = 'lwf/medal/compose/strength/card_strength_result_01/'
if os.path.isdir(os.path.join(SRC, *_LU.split('/'))):
    for _n in range(1, 6):
        _ev = 'card_evolution_result_%02d' % _n
        _lwf_copy(_LU, 'lwf/medal/compose/evolution/%s/' % _ev, 'card_strength_result_01', _ev)
    # Level Up con 2-5 materiali (card_strength_result_%02d, %02d = numero dei
    # materiali; NULL = crash dopo la risposta, banco gu_17): nelle risorse c'e'
    # solo la _01, che mostra una sola carta
    for _n in range(2, 6):
        _st = 'card_strength_result_%02d' % _n
        _lwf_copy(_LU, 'lwf/medal/compose/strength/%s/' % _st, 'card_strength_result_01', _st)
for _f in os.listdir(os.path.join(SRC, *PUB.split('/'))):
    if _f.startswith('But') and _f.endswith(('_On.png', '_Off.png', '_Disable.png')):
        COPIES.setdefault('img/ui/' + _f, PUB + _f)
TEXTURES |= {k.split('/')[-1] for k in COPIES if k.startswith(PUB)}
# texture disegnate da make_textures.py in cocostudio/publish (es. rare_star.png)
TEXTURES |= set(re.findall(r"save\('([^'/]+\.png)'",
                           open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'make_textures.py'),
                                encoding='utf-8').read()))


def retex(w):
    """Texture dark_* -> equivalente KHUX."""
    for v in w.get('options', {}).values():
        if isinstance(v, dict) and str(v.get('path', '')).startswith('dark_'):
            p = v['path']
            v['path'] = DARK_TO_KHUX.get(p) or (p[5:] if p[5:] in TEXTURES else p)
    for c in w.get('children', []):
        retex(c)


# Modelli dei widget: uno per classe, da un layout vero (cocostudio 1.6).
_tmpl = json.load(open(os.path.join(SRC, *PUB.split('/'), 'dark_PresentBOX_base.json'), encoding='utf-8-sig'))
TEMPLATES = {}


def _collect(w):
    TEMPLATES.setdefault(w['classname'], w)
    for c in w.get('children', []):
        _collect(c)


_collect(_tmpl['widgetTree'])
# CheckBox: dal popup Sort originale (filtri: But16 con la croce But16_On)
_collect(json.load(open(os.path.join(SRC, *PUB.split('/'), 'PopupNormal_SortButton_ver320.json'),
                        encoding='utf-8-sig'))['widgetTree'])
# LabelAtlas: dal Profilo originale (AtlasLabel_NumL)
_collect(json.load(open(os.path.join(SRC, *PUB.split('/'), 'AvatarInfo_Txt_ver340.json'),
                        encoding='utf-8-sig'))['widgetTree'])
_tag = [1000]


def tex(path):
    if path not in TEXTURES:
        raise SystemExit('texture assente dalle risorse: ' + path)
    return {'path': path, 'plistFile': '', 'resourceType': 0}


def build(s):
    w = json.loads(json.dumps(TEMPLATES[s['cls']]))
    w['children'] = [build(c) for c in s.get('children', [])]
    o = w['options']
    _tag[0] += 1
    o.update(name=s['name'], x=s['x'], y=s['y'], width=s['w'], height=s['h'], tag=_tag[0],
             actiontag=_tag[0], visible=s.get('visible', True))
    if 'scale' in s:                    # es. icone a cui il codice carica la texture
        o.update(scaleX=s['scale'], scaleY=s['scale'])
    if 's9' in s:                       # False per le icone: il modello ha il 9-slice (bordo 50)
        o['scale9Enable'] = s['s9']
    o.update(s.get('opts', {}))         # opzioni come nei layout originali (es. capInsetsX)
    if 'ignoreSize' in s:               # False: la texture caricata dal codice si adatta a w x h
        o['ignoreSize'] = s['ignoreSize']
    w['name'] = s['name']
    if s['cls'] == 'ImageView':
        o.update(fileNameData=tex(s['tex']), scale9Width=s['w'], scale9Height=s['h'])
        if s.get('flipX'):
            o['flipX'] = True
    elif s['cls'] == 'Button' and s['tex'] == 'But_Close':
        # X tonda di chiusura (But_CloseA/B, senza le varianti _Off/_On)
        o.update(normalData=tex('But_CloseA.png'), pressedData=tex('But_CloseB.png'),
                 disabledData=tex('But_CloseA.png'), scale9Enable=False, text='')
    elif s['cls'] == 'Button':
        base = s['tex']
        for key, suf in (('normalData', '_Off'), ('pressedData', '_On'), ('disabledData', '_Disable')):
            p = base + suf + '.png'
            o[key] = tex(p) if p in TEXTURES else (tex(base + '_Off.png') if key != 'normalData' else tex(p))
        o.update(scale9Width=s['w'], scale9Height=s['h'], text='')
    elif s['cls'] == 'CheckBox':
        # come i filtri del popup Sort: sfondo <base>_Off, scelta <base>_On (sfondo e croce)
        base = s['tex']
        dis = base + '_Disable.png'
        o.update(backGroundBoxData=tex(base + '_Off.png'), backGroundBoxSelectedData=tex(base + '_On.png'),
                 frontCrossData=tex(base + '_On.png'),
                 backGroundBoxDisabledData=tex(dis if dis in TEXTURES else base + '_Off.png'),
                 frontCrossDisabledData={'path': None, 'plistFile': None, 'resourceType': 0},
                 selectedState=False)
    elif s['cls'] == 'Label':
        o.update(text=s.get('text', ''), fontSize=s.get('size', 22), areaWidth=s['w'], areaHeight=s['h'])
    elif s['cls'] == 'LabelAtlas':
        o.update(charMapFileData=tex(s['tex']), itemWidth=s['item'][0], itemHeight=s['item'][1],
                 startCharMap=s['start'], stringValue=s['text'])
    elif s['cls'] == 'Panel':
        o.update(touchAble=False)
    return w


def sell_popup(icon='MedalSellIcon', name='Txt_Medal_Name_Dlog', extra=(), icon_pos=(-172, 225, 1.5)):
    """Popup della quantita' da vendere: EquipSell_Medal_Step1_ver131 (medaglie impilate) ed EquipSell_Dialog_Step1 (materiali). Assenti da ogni
    risorsa. Struttura dal discendente di Dark Road dark_Shop_win_check_pop3 (stessi
    panel_MaterialStock, Button_stock_up/down, Slider MaterialStock_bar); aspetto e misure
    dal popup originale (reference\\medal_list\\web_qty_368.png, youtube WiFh447niJY,
    video 1280x608, scala 1,12 in x e 0,95 in y): finestra blu, icona e targa del nome
    in alto, fascia «Includes ★★★ Medals or higher.» (Warning_Plate, Txt_Rare1/2),
    «Quantity» (Txt_data2, testo 102000001) e «1/15» (Txt_data3), slider in un riquadro
    scuro con le frecce, targa Munny (Txt_MoneyTotalStock_Fix, Icon_Prize2, Txt_data5),
    Cancel arancione e Sell rosso. Figli della finestra (ImageView) rispetto al centro."""
    d = json.load(open(os.path.join(SRC, *PUB.split('/'), 'dark_Shop_win_check_pop3.json'), encoding='utf-8-sig'))
    t = d['widgetTree']
    win = find(t, 'win_normaltext')
    # Win04 (100x322) in 9-slice anche in verticale: con capInsetsY 0 la fascia chiara in alto
    # veniva stirata su meta' finestra
    win['options'].update(fileNameData=tex('Win04.png'), scale9Enable=True, capInsetsX=50, capInsetsY=60,
                          capInsetsWidth=1, capInsetsHeight=200, width=640, height=560, scale9Width=640,
                          scale9Height=560)
    keep = []
    for c in win['children']:
        n = c['options']['name']
        if n in ('but_ok', 'but_close'):
            ok = n == 'but_ok'
            o = c['options']
            o.update(name='Button_sell_ok' if ok else 'Button_cancel', x=132 if ok else -133, y=-235,
                     normalData=tex('But01_Off.png' if ok else 'But03_Off.png'),
                     pressedData=tex('But01_On.png' if ok else 'But03_On.png'),
                     disabledData=tex('But01_Disable.png' if ok else 'But03_Off.png'),
                     width=172, height=56, scale9Width=172, scale9Height=56, **BUT9)
            c['name'] = o['name']
            lab = c['children'][0]
            lab['options'].update(name='Txt_sell_ok' if ok else 'Txt_cancel', fontSize=24,
                                  text='Sell' if ok else 'Cancel')
            lab['name'] = lab['options']['name']
        elif n == 'panel_MaterialStock':
            c['options'].update(x=-16, y=-34)
            for b, x in (('Button_stock_up', 232), ('Button_stock_down', -232)):
                find(c, b)['options']['x'] = x
            back = find(c, 'MaterialStock_back')['options']
            back.update(width=353, scale9Width=353)
            bar = find(c, 'MaterialStock_bar')['options']
            # barra semplice (senza MIN/MAX di Opt_Vol_Gage), pallino blu delle opzioni
            bar.update(ballNormalData=tex('Scroll_bar_off.png'), ballPressedData=tex('Scroll_bar_on.png'),
                       width=353)
        else:
            continue                        # txt_wording, But_draw, txt_possessed, assets: non usati
        keep.append(c)
    win['children'] = keep
    head = [
        # riquadro scuro dello slider, dietro panel_MaterialStock
        I('Slider_Base', -16, -34, 576, 154, 'Panel04.png', opts=GRID),
        # nomi composti a pezzi sullo stack, non trovati da widget_lookup.py (func_strings.py)
        I(icon, icon_pos[0], icon_pos[1], 89, 109, 'Medal_S_00000001.png', s9=False, scale=icon_pos[2]),
        I('Name_Plate', 37, 187, 360, 36, 'Plate03.png', opts=PLATE3),
        L(name, 37, 187, 330, 32, '', 22),
        L('Txt_data2', -239, 62, 200, 34, 'Quantity', 26),
        # «1/15» come nell'originale: il codice scrive la quantita' scelta in
        # Txt_MaterialStock_Fix_2 e il massimo in _3 (banco); Txt_data3 non lo tocca: e' la barra
        L('Txt_MaterialStock_Fix_2', -20, 62, 80, 40, '1', 32),
        L('Txt_data3', 13, 62, 30, 40, '/', 32),
        L('Txt_MaterialStock_Fix_3', 48, 62, 80, 40, '1', 32),
        I('Money_Plate', 105, -166, 366, 30, 'Plate03.png', opts=PLATE3),
        # il codice scrive il ricavo in Txt_MoneyTotalStock_Fix e «Munny» in Txt_data5 (banco)
        L('Txt_data5', -15, -166, 120, 28, 'Munny', 20),
        I('Icon_Prize2', 75, -166, 44, 46, 'Icon_Prize.png', s9=False, scale=0.5),
        L('Txt_MoneyTotalStock_Fix', 205, -166, 160, 30, '0', 22, opts=dict(colorB=0)),
        # fascia rossa «Includes ★★★ Medals or higher.» (reference\medal_list\web_qty_368.png:
        # rosso 233,18,38 con i bordi 255,2,0, testo bianco, stelle d'oro fisse nel layout).
        # Il codice cerca Txt_Rare1/2 dentro Warning_Plate e ne chiama solo setVisible (rari > 2):
        # Panel senza tinta, altrimenti il colore passa ai testi
        P('Warning_Plate', -304, 98, 576, 34, [
            P('Warning_Base', 0, 3, 576, 28, opts=RED_BG),
            P('Warning_Top', 0, 31, 576, 3, opts=dict(RED_BG, bgColorG=2, bgColorB=0, bgColorR=255)),
            P('Warning_Bottom', 0, 0, 576, 3, opts=dict(RED_BG, bgColorG=2, bgColorB=0, bgColorR=255)),
            L('Txt_Rare1', 150, 17, 160, 28, 'Includes', 22),
            I('Rare_Star1', 228, 17, 26, 26, 'rare_star.png', s9=False, scale=1.5),
            I('Rare_Star2', 260, 17, 26, 26, 'rare_star.png', s9=False, scale=1.5),
            I('Rare_Star3', 292, 17, 26, 26, 'rare_star.png', s9=False, scale=1.5),
            L('Txt_Rare2', 450, 17, 260, 28, 'Medals or higher.', 22)], visible=False),
    ]
    win['children'] = [build(head[0])] + win['children'] + [build(s) for s in head[1:] + list(extra)]
    return d


def equip_sell_popup():
    return sell_popup(extra=[
        # nome con uno spazio ideografico in coda (U+3000), come lo cerca il codice
        # ("Txt_data" + 34 e3 80 80): senza, crash in enableShadow; testo 102000002 = " "
        L('Txt_data4　', 13, 30, 300, 24, '', 18)])


def superburst_select_window():
    """ActionMap_SuperBurst_SelectWindow (pulsante Supernova in battaglia). Base = copia WW: con l'intero layout JP
    00338703 il pulsante saliva sopra quello del Burst (fotogrammi di SuperBurst_UI diversi, banco 21-10). Dal JP si
    prende solo l'ImageView «Medal» (actiontag 12257514, sopra SuperBurst_but) coi suoi fotogrammi in ogni animazione: ci mette img/medal/Medal_S_<imageId>.png della Supernova scelta e la animazione Receive
    (caso 3) la mostra; senza il widget si vedeva solo il lampo (I-190). Pulsante: l'icona SN dei filtri al
    posto della bussola SBurst_but01/02 (texture SBurst_SN_but01/02 di make_textures.py, decisione dell'utente 15-10)."""
    name = 'ActionMap_SuperBurst_SelectWindow.json'

    def find(n, k):
        if n['options']['name'] == k:
            return n
        return next((r for c in n.get('children', []) for r in [find(c, k)] if r), None)

    d = json.load(open(os.path.join(SRC, *PUB.split('/'), name), encoding='utf-8-sig'))
    jp_path = jp_latest(name)
    ui = find(d['widgetTree'], 'SuperBurst_UI')
    if os.path.isabs(jp_path) and not find(ui, 'Medal'):
        jp = json.load(open(jp_path, encoding='utf-8-sig'))
        medal = find(jp['widgetTree'], 'Medal')
        at = next(i for i, c in enumerate(ui['children']) if c['options']['name'] == 'SuperBurst_but') + 1
        ui['children'].insert(at, medal)
        tag = medal['options']['actiontag']
        jp_acts = {a['name']: a for a in jp['animation']['actionlist']}
        for act in d['animation']['actionlist']:
            act['actionnodelist'] += [n for n in jp_acts.get(act['name'], {}).get('actionnodelist', [])
                                      if n.get('ActionTag') == tag]
    but = find(d['widgetTree'], 'SuperBurst_but')['options']
    but['normalData'] = {'path': 'SBurst_SN_but01.png', 'plistFile': '', 'resourceType': 0}
    but['pressedData'] = {'path': 'SBurst_SN_but02.png', 'plistFile': '', 'resourceType': 0}
    return d


def material_sell_popup():
    """EquipSell_Dialog_Step1: come il popup delle medaglie, con
    MaterialSellIcon (img/material/material_%d.png), Txt_Material_Name_Dlog,
    Txt_Material_Info_Dlog, Txt_MoneyStock_Fix e Txt_data1."""
    # icona dei materiali (img/material, ~60 px) meno ingrandita di quella delle medaglie;
    # prezzo unitario nel riquadro dello slider: «Price» (Txt_data1), icona, valore in giallo
    # (Txt_MoneyStock_Fix)
    return sell_popup('MaterialSellIcon', 'Txt_Material_Name_Dlog', icon_pos=(-200, 200, 1.1), extra=[
        L('Txt_Material_Info_Dlog', 37, 135, 500, 40, '', 18),
        L('Txt_data1', -90, 20, 120, 26, '', 20),
        I('Icon_Price', -10, 20, 44, 46, 'Icon_Prize.png', s9=False, scale=0.45),
        L('Txt_MoneyStock_Fix', 70, 20, 120, 26, '', 20, opts=dict(colorR=255, colorG=230, colorB=60)),
        # cercato anche qui (stack al crash); la variante con U+3000 delle medaglie per sicurezza
        L('Txt_data4', 13, 30, 300, 24, '', 18),
        L('Txt_data4　', 13, 30, 300, 24, '', 18)])


def trait_medal_select_popup():
    """MoogleShop_Traits_MedalSelect_Pop_ver410, assente da ogni risorsa.
    Disposizione dal video della 4.1.0 giapponese (reference\\moogle_shop\\jp410_136.png,
    1280x720: x = x'/1,127 - 88, y = (720 - y')/1,127): a sinistra la targa del trait
    (SkillPanel: kakusei_Icon, Txt_KakuseiSkill), la medaglia scelta (MedalArea: il codice
    vi aggiunge la medaglia grande), i trait della medaglia
    (KakuseiSkill_Window, riempita) o, senza medaglia, Win_Base con
    Txt_Traits_Text (testo 106220418), in basso il prezzo (Jewel/Txt_Jewel o
    Munnies/Txt_Munnies secondo payType) e Button_OK/Txt_OK (106220407 «Set Trait»); a
    destra Win_under: Scroll_Area (griglia delle medaglie), Txt_Possession
    (101510001 «Slots»), Txt_Cost_Label/Txt_Slash_Label/Txt_CostMax_Label e la barra di
    ordinamento (Button_Sort, Txt_Sort_Label, Txt_Filter_On); Arrow01 tra le
    due finestre e Close_Button in alto a destra."""
    win = dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    root = build(P('Panel_MedalSelect', 0, 0, 960, 640, [
        I('Win_Left', 283, 314, 556, 614, 'Win04.png', opts=win),
        I('Win_Right', 758, 314, 390, 614, 'Win04.png', opts=win),
        I('SkillPanel', 180, 584, 330, 36, 'Plate25.png',
          opts=dict(scale9Enable=True, capInsetsX=32, capInsetsY=0, capInsetsWidth=1, capInsetsHeight=1), children=[
              I('kakusei_Icon', -140, 0, 48, 48, 'Kakusei_Icon0010.png', s9=False, scale=0.75),
              L('Txt_KakuseiSkill', -110, 0, 260, 24, '', 20, opts=dict(anchorPointX=0))]),
        # cerca Medal1 dentro MedalArea e vi aggiunge la medaglia
        # senza controlli: senza, crash al tocco di «Select Medal» (stack ts3). La medaglia
        # vuota (nessuna scelta) ha il centro 88 px sopra e a destra di Medal1 (banco): la
        # medaglia e' 176x176 con l'angolo in basso a sinistra sull'origine di Medal1, e
        # Medal1 ha la stessa misura (bersaglio del trascinamento)
        P('MedalArea', 115, 272, 160, 180, [P('Medal1', 80, 90, 176, 176)]),
        # stessa cornice e misura di KakuseiSkill_Window a uno slot (bordo superiore a 372),
        # che la copre del tutto quando si sceglie una medaglia (il codice non la nasconde)
        I('Win_Base', 282, 315, 464, 114, 'Medal_Detail_Field2.png',
          opts=dict(scale9Enable=True, capInsetsX=240, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=1),
          children=[L('Txt_Traits_Text', 0, -14, 420, 50, '', 22)]),
        P('Jewel', 25, 24, 230, 36, [
            I('Plate_Jewel', 115, 18, 230, 32, 'Plate03.png', opts=PLATE3),
            I('Icon_Jewel', 28, 18, 90, 90, 'IncentiveIcon_01.png', s9=False, scale=0.4),
            L('Txt_Jewel', 215, 18, 160, 30, '0', 24, opts=dict(anchorPointX=1))]),
        P('Munnies', 25, 24, 230, 36, [
            I('Plate_Munnies', 115, 18, 230, 32, 'Plate03.png', opts=PLATE3),
            I('Icon_Munnies', 28, 18, 56, 57, 'IncentiveIcon_04.png', s9=False, scale=0.6),
            L('Txt_Munnies', 215, 18, 160, 30, '0', 24, opts=dict(anchorPointX=1))], visible=False),
        B('Button_OK', 410, 42, 330, 68, 'But01', 'Set Trait', 30, label='Txt_OK', opts=BUTS),
        P('Win_under', 564, 7, 390, 614, [
            L('Txt_Medal_Title', 55, 588, 110, 30, 'MEDAL', 26, opts=dict(colorR=255, colorG=230, colorB=120)),
            # targa a sinistra di Close_Button (che sta sull'angolo della finestra)
            I('Plate_Possession', 242, 588, 220, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Possession', 172, 588, 90, 24, 'Slots', 17),
            L('Txt_Cost_Label', 262, 588, 60, 24, '0', 18),
            L('Txt_Slash_Label', 290, 588, 14, 24, '/', 18),
            L('Txt_CostMax_Label', 320, 588, 60, 24, '0', 18),
            I('Grid_Under', 195, 312, 380, 492, 'Panel04.png', opts=GRID),
            P('Scroll_Area', 8, 72, 374, 482),
            I('Img_SortType', 100, 34, 185, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Sort_Label', 100, 34, 180, 26, 'Strength', 18),
            L('Txt_Filter_On', 100, 12, 180, 20, 'Filter ON', 14),
            B('Button_Sort', 290, 34, 233, 68, 'But03', 'Sort', 30, opts=BUTS)]),
        I('Arrow01', 562, 330, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.6),
        B('Close_Button', 944, 614, 64, 64, 'But01', None)]))
    # chiusura: X tonda del dettaglio (But_CloseA/B, senza le varianti _Off/_On)
    o = find(root, 'Close_Button')['options']
    o.update(normalData=tex('But_CloseA.png'), pressedData=tex('But_CloseB.png'),
             disabledData=tex('But_CloseA.png'), scale9Enable=False)
    # KakuseiSkill_Window dalla finestra dei trait del dettaglio medaglia originale (stessi
    # nomi: Txt_SkillTitle, Txt_Skill_Num, Panel; ImageView ancorata in alto, alta per uno
    # slot): l'allunga di 52 per ogni slot oltre il primo e vi aggiunge le righe
    # MedalInfo_KakuseiInfo_ver150 («infoPanel%d») 52 px l'una sotto l'altra.
    src = json.load(open(os.path.join(SRC, *PUB.split('/'), 'MedalInfo_KakuseiInfoWindow_ver150.json'),
                         encoding='utf-8-sig'))
    ksw = find(src['widgetTree'], 'KakuseiSkill_Window')
    ksw['options'].update(x=282, y=372, visible=False)
    root['children'].insert(5, ksw)
    data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
    data['widgetTree'] = root
    return data


def _layout(root):
    data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
    data['widgetTree'] = build(root)
    return data


# Outfits del pet (PetEditScene_ver230 init). Disposizione da
# reference\pet\pet_ref_04.png (1721x931 senza la barra in alto: x = x'/1,793, y = 520 - y'/1,793):
# schede Head..Accessories sopra la finestra blu, parti in due colonne, Remove arancione e Save
# rosso in basso, pet a destra con «OUTFIT n» e il pulsante ciclico.
def pet_edit_win():
    """Nodo CenterUI_Left: tab1..tab6 (ImageView a cui il pulsante «Av_Make_Win_But»
    creato dal codice carica img/ui/Av_Make_Win_But_Off/On, servite; Txt_Tab = 106110401-406 Head,
    Ears, Body, Legs, Tail, Accessories; Icon_New facoltativo), Area (lista delle
    parti celle PetEdit_Panel_ver230 298x122 in due colonne), Txt_NoPet
    (106110409 «There are no Spirit parts.», visibile con la lista vuota). Come
    AvatarEdit_Win_ver131 senza la fascia COST/filtro dell'avatar."""
    tabs = [I('tab%d' % (i + 1), -246 + 98 * i, 214, 104, 56, 'Av_Make_Win_But_Off.png', s9=False, scale=0.93,
              children=[L('Txt_Tab', 0, -4, 100, 42, '', 22),
                        I('Icon_New', -24, 18, 70, 56, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False)])
            for i in range(6)]
    return _layout(P('PetEdit_Win', 0, 0, 640, 640, [
        I('Base', 312, 273, 608, 382, 'Panel04.png', opts=PANEL4, children=tabs + [
            P('Area', -296, -183, 592, 366),
            L('Txt_NoPet', 0, 0, 560, 40, 'There are no Spirit parts.', 24, visible=False)])]))


def pet_edit_right():
    """Nodo CenterUI_Right: KB_On (il codice lo nasconde), Avatar2 (vi mette l'avatar accanto, poi lo toglie), Pet e Pet2 (i due pet aggiunti
    al genitore nella loro posizione: dentro un pannello in scala 2 come il pet del dialog).
    Set_ChangeBut_New (pet / pet con l'avatar) e' facoltativo e non c'e': carica
    cocostudio/publish/PetChangeBut_*.png, assenti da ogni risorsa."""
    return _layout(P('PetEdit_Right', 0, 0, 960, 640, [
        P('KB_On', 0, 0, 10, 10, visible=False),
        P('Avatar2', 880, 110, 10, 10),
        P('PetScale', 790, 110, 10, 10, [P('Pet', 0, 0, 10, 10), P('Pet2', -40, 0, 10, 10)],
          opts=dict(scaleX=2.0, scaleY=2.0))]))


def pet_edit_decision():
    """Nodo Decision (lo mostra): Button_PetSave > Txt_PetSave (106110407 «Save» salvataggio POST /pet/coordinate/update 173, poi
    PetEdit_Check2), Button_Remove > Txt_Remove (106110400 «Remove»; lo
    abilita/spegne). Come AvatarEdit_Decision."""
    return _layout(P('PetEdit_Decision', 0, 0, 960, 100, [
        B('Button_Remove', 96, 48, 200, 68, 'But03', 'Remove', 28, label='Txt_Remove', opts=BUTS),
        B('Button_PetSave', 507, 47, 260, 68, 'But01', 'Save', 32, label='Txt_PetSave', opts=BUTS)]))


def pet_edit_coordinate():
    """Nodo MyCoordinate (lo mostra): Box_Num (ImageView: vi carica
    img/ui/Av_Box_Num%d.png, servite 1-6) e Button_Switch (outfit successivo 1..6).
    Come AvatarEdit_MyCoordinate (Button_Coordinate con Box_Num, Button_Switch con l'icona), con
    la scritta «OUTFIT» gialla del riferimento al posto del titolo giapponese."""
    return _layout(P('PetEdit_MyCoordinate', 0, 0, 960, 100, [
        L('Txt_Outfit', 615, 76, 160, 30, 'OUTFIT', 26, opts=dict(anchorPointX=0, colorR=255, colorG=220, colorB=40)),
        I('Button_Coordinate', 664, 40, 124, 42, 'Av_Make_Box.png', s9=False, children=[
            I('Box_Num', -17, 0, 37, 24, 'Av_Box_Num1.png', s9=False)]),
        B('Button_Switch', 760, 40, 150, 68, 'But03', None, opts=BUTS, children=[
            I('Change', 0, 1, 43, 41, 'Av_Make_Icon.png', s9=False, scale=1.2)])]))


def pet_edit_panel():
    """Cella di una parte (298x122, layout in «mainPanel», setOpacity su Panel; la riempie): Area_Point, Icon_Base, Icon_New, Txt_Equip_New (testo), Panel_On
    (selezionata), Icon_Pet (img/petParts/pi%d.png, assenti: ImageView senza 9-slice), Txt_Name,
    Txt_Category. Come AvatarEdit_Panel_ver131 (Win09, Av_Make_Panel_01_M, Av_Make_Panel_On)."""
    return _layout(P('PetEdit_Panel', 0, 0, 298, 122, [
        I('Panel', 149, 61, 294, 119, 'Win09.png', opts=WIN9, children=[
            I('Icon_Base', -92, 0, 105, 105, 'Av_Make_Panel_01_M.png', s9=False, scale=0.95),
            I('Icon_Pet', -92, 0, 101, 101, 'Av_Make_Panel_01_M.png', s9=False, scale=0.95),
            L('Txt_Name', 50, 15, 170, 56, '', 18, opts=dict(ignoreSize=False, hAlignment=0, vAlignment=1)),
            L('Txt_Category', 50, -35, 170, 22, '', 15),
            I('Panel_On', 0, 0, 300, 125, 'Av_Make_Panel_On.png', s9=False, visible=False),
            P('Area_Point', 0, 0, 30, 30),
            L('Txt_Equip_New', 100, -40, 80, 30, 'In use', 18, visible=False),
            I('Icon_New', -120, 45, 70, 56, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False)])]))


def pet_edit_check2():
    """«Style saved!» dopo Save: Win_04 (animazione d'apertura) con Txt_Wording
    (106110410) e Pet (il pet salvato va al suo posto, Pet viene tolto); un tocco
    chiude. Come AvatarEdit_Check2 (Win01, sfondo Av_Make_Win_Bg), in blu Win04 come
    reference\\pet\\pet_ref_10."""
    win4 = dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    return _layout(P('PetEdit_Check2', 0, 0, 960, 640, [
        I('Win_04', 480, 320, 600, 480, 'Win04.png', opts=win4, children=[
            I('Av_Make_Win_Bg', 0, 0, 664, 400, 'Av_Make_Win_Bg.png', s9=False, opts=dict(scaleX=0.82, scaleY=0.82)),
            L('Txt_Wording', 0, 195, 560, 40, '', 30, opts=dict(colorR=255, colorG=220, colorB=40)),
            P('PetScale', 0, -120, 10, 10, [P('Pet', 0, 0, 10, 10)], opts=dict(scaleX=2.0, scaleY=2.0)),
            L('Txt_Tap', 0, -205, 300, 30, 'TAP SCREEN', 20)])]))


def pet_training_slots(cxs, cys):
    """Slot dello Spirit Training (cercati dentro MedalArea):
    per i = 1..4 Medal%d (vi aggiunge la cella 175x175 con l'angolo in
    basso a sinistra sull'origine, come nel dialog), MedalLock_Panel%d (slot bloccato, con
    Txt_Caution: 106200407/408/409 o 106270102; per lo slot 3 ne fa un CustomRichText
    «Xml_Txt_Caution») e Period_NamePanel%d con Txt_Period (scadenza «Till Expiry: %s» 106200410 o
    «Valid for %s» 106200419). Slot aperti = 1 + openMedalSlotNumber di GET /pet/expedition con
    scadenza futura. Centri delle celle in (cxs[i], cys[i]) rispetto a MedalArea."""
    out = []
    for i, (cx, cy) in enumerate(zip(cxs, cys), 1):
        out.append(P('Medal%d' % i, cx - 88, cy - 88, 175, 175))
    for i, (cx, cy) in enumerate(zip(cxs, cys), 1):
        out.append(P('MedalLock_Panel%d' % i, cx - 88, cy - 88, 175, 175, [
            I('Lock_Base', 88, 88, 160, 160, 'Panel04.png', opts=dict(GRID, opacity=220)),
            I('Lock_Icon', 88, 122, 118, 118, 'QuestBut_Lock.png', s9=False, scale=0.5),
            L('Txt_Caution', 88, 58, 150, 60, '', 15, opts=dict(ignoreSize=False, hAlignment=1, vAlignment=1))],
          visible=False))
        out.append(P('Period_NamePanel%d' % i, cx - 100, cy - 118, 200, 28, [
            I('Period_Plate', 100, 14, 200, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Period', 100, 14, 190, 24, '', 15)], visible=False))
    return out


def pet_training_edit():
    """PetInfo_TrainingEdit_ver320 (Spirit Training, scelta delle medaglie: initPetTrainingMedalSelectPanel), assente da ogni risorsa. Nomi dal client:
    - Win_under (dalla radice): Button_Sort > Txt_Sort, Txt_Sort_Label, Txt_Filter_On
      (barra d'ordinamento), Scroll_Area (modo 4), Txt_Possession (101510001 «Slots»), Txt_Cost_Label / Txt_Slash_Label /
      Txt_CostMax_Label (medaglie possedute / massimo); Win_under e' anche il riquadro di rilascio
      del trascinamento;
    - Win2A (finestra di sinistra, presa dalle), Close_Button, Button_Training
      > Txt_Training (106200426 «Train»: POST /pet/expedition 244 {userMedalIds}),
      Arrow01;
    - MedalArea (initPetTrainingSlotView): a 4 slot, vedi
      pet_training_slots.
    Stessa disposizione della scelta medaglia dei trait (trait_medal_select_popup): a sinistra gli
    slot 2x2 con «Train» in basso, a destra MEDAL con la griglia e Sort; stile dei riferimenti
    reference\\pet (finestre blu Win04, pulsanti rossi)."""
    win = dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    root = build(P('PetTraining_root', 0, 0, 960, 640, [
        I('Win2A', 283, 314, 556, 614, 'Win04.png', opts=win),
        L('Txt_Title', 30, 592, 400, 36, 'SPIRIT TRAINING', 28,
          opts=dict(anchorPointX=0, colorR=240, colorG=120, colorB=235)),
        P('MedalArea', 30, 110, 506, 440, pet_training_slots((128, 378, 128, 378), (330, 330, 105, 105))),
        B('Button_Training', 283, 50, 300, 68, 'But01', 'Train', 30, label='Txt_Training', opts=BUTS),
        P('Win_under', 564, 7, 390, 614, [
            L('Txt_Medal_Title', 55, 588, 110, 30, 'MEDAL', 26, opts=dict(colorR=255, colorG=230, colorB=120)),
            I('Plate_Possession', 242, 588, 220, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Possession', 172, 588, 90, 24, 'Slots', 17),
            L('Txt_Cost_Label', 262, 588, 60, 24, '0', 18),
            L('Txt_Slash_Label', 290, 588, 14, 24, '/', 18),
            L('Txt_CostMax_Label', 320, 588, 60, 24, '0', 18),
            I('Grid_Under', 195, 312, 380, 492, 'Panel04.png', opts=GRID),
            P('Scroll_Area', 8, 72, 374, 482),
            I('Img_SortType', 100, 34, 185, 26, 'Plate03.png', opts=PLATE3),
            L('Txt_Sort_Label', 100, 34, 180, 26, 'Strength', 18),
            L('Txt_Filter_On', 100, 12, 180, 20, 'Filter ON', 14),
            B('Button_Sort', 290, 34, 233, 68, 'But03', 'Sort', 30, opts=BUTS)]),
        I('Arrow01', 562, 330, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.6),
        B('Close_Button', 944, 614, 70, 70, 'But_Close')]))
    data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
    data['widgetTree'] = root
    return data


def pet_training_slot_check():
    """PetInfo_TrainingSlotCheck_ver320 («Training Slots»: openPetTrainingSlotInfoPopup), assente da ogni risorsa. Il codice cerca solo MedalArea e
    Win_under (i 4 slot di pet_training_slots e il riquadro di rilascio) e
    Close_Button (01ee12d8). Finestra blu con i 4 slot in fila e la X in alto a destra."""
    win = dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    root = build(P('PetTrainingSlot_root', 0, 0, 960, 640, [
        I('Win_under', 480, 330, 880, 400, 'Win04.png', opts=win),
        L('Txt_Title', 70, 495, 400, 36, 'TRAINING SLOTS', 28,
          opts=dict(anchorPointX=0, colorR=240, colorG=120, colorB=235)),
        P('MedalArea', 70, 160, 820, 300, pet_training_slots((105, 305, 505, 705), (160, 160, 160, 160))),
        B('Close_Button', 905, 515, 70, 70, 'But_Close')]))
    data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
    data['widgetTree'] = root
    return data


def _action_frame(fid, x, y, scale=1.0, opacity=255):
    """Fotogramma di un'azione cocostudio 1.6 (come ActionMap_Success_Treasure_Null: posizione
    nel genitore, scala, opacita'; ActionNode crea un frame per ogni chiave presente)."""
    return {'classname': None, 'name': None, 'colorb': 255, 'colorg': 255, 'colorr': 255, 'frameid': fid,
            'opacity': opacity, 'positionx': x, 'positiony': y, 'rotation': 0, 'scalex': scale, 'scaley': scale,
            'starttime': 0, 'tweenParameter': [], 'tweenType': 0, 'visible': False}


def pet_training_production():
    """PetInfo_TrainingProduction (animazione dopo «Train», I-082), assente da ogni risorsa: senza,
    dopo POST /pet/expedition (244) e GET /pet/profile il client andava in crash in GUIReader
    (SIGSEGV sullo stack la stringa «widgetTree»). Catena: la 170 del ramo
    244 chiude il pannello di scelta di createLayout
    (= 1; per le medaglie successive): MedalMixResultScene_ver320 (originale) e sopra questo layout, aggiunto col nome
    PetTrainingAnime. Il codice cerca:
    - per i = 1..3 «%dPet» con dentro «Pet_Shadow» e «Pet» (nascosti dal codice; della texture di
      Pet fa la maschera, getVirtualRenderer->getTexture: ImageView con texture vera, quella
      dell'icona del pet della home GlobalNavi Topinfo_Pet_Mask) e «%d_parameter» (scala e
      posizione del pet nella maschera): nel genitore di Pet aggiunge il pet ritagliato
      (PetIcon%d / PetIconShadow%d, movimenti training1/training2);
    - «4Pet»: vi aggiunge il pet intero (PetIcon4, training3);
    - l'azione «Training_Anime» del layout (ActionManagerEx, chiave = nome del file):
      (stop) senza controllo del null, poi play con la callback che va avanti
      (Kakusei_Get1). Il tocco (pulsante tapBtn
      creato dal codice) salta l'animazione.
    Aspetto dall'originale (video kTJoSgXii1E, reference\\pet\\pet_training_anim_03-05.png,
    NOTE.md §10): fumetto senza testo su fondo bianco, quattro vignette inclinate col bordo nero
    che entrano una dopo l'altra (scacchi verde acqua col pet = 1Pet, linee viola col muso = 2Pet,
    fascia azzurra con le stelle = 3Pet, selciato arancione), il pet intero che corre nella fascia
    (4Pet), poi bianco (~3 s). Le vignette e le maschere (stessa sagoma, bianche) sono di
    make_pet_training_fx.py; Pet/Pet_Shadow hanno la maschera (il client ci ritaglia il pet e la
    sua ombra nera, spostata di 6 px). Prima: cerchi vuoti della cornice della home e
    «TRAINING!» (nostro), segnalazione utente 12-10.
    Rifatto dopo il confronto col foglio pet_training_anim_00_sheet (segnalazione utente 12-10:
    vignette piccole in alto, pet minuscolo, bianco troppo presto):
    - vignette a tutto schermo 16:9 (make_pet_training_fx.ref_to_layout: il layout e' adattato
      all'altezza e centrato, lo schermo e' x -88..1048);
    - pet enorme come nell'originale: maschere invertite (il client cancella il pet dove la
      maschera e' opaca, blend {0, 1-srcA}) e %d_parameter calcolato da
      make_pet_training_fx.pet_parameter (k = min(max(1, scala GLView),
      3,9 / s); posizione * k + testa = piedi del pet nella maschera). 1Pet s 4,2 = pet intero
      alto quanto la vignetta; 2Pet s 6,5 = solo il muso; 3Pet s 3,9 nella fascia; 4Pet s 3,4
      (nodo scalato) corre da destra a sinistra (il pet guarda a -x; training3 = corsa);
    - tempi: vignette in entrata 0,1-1,3 s (1 in dissolvenza, 2 e la fascia da destra, 4 dal
      basso), il pet corre 1,2-3,1 s, bianco 3,2-3,5 s, fine dell'azione a 3,6 s."""
    import make_pet_training_fx as fx
    panels, nodes = [], []

    def in_mask(pname, xr, yr):
        """punto del riferimento 1280x720 -> unita' del layout dall'angolo in basso a sinistra
        della maschera della vignetta (y in su)."""
        x0, y0, w, h, _pts = fx.panel_geometry(pname)
        lx, ly = fx.ref_to_layout(xr, yr)
        return lx - x0, (y0 + h) - ly
    # nome vignetta, nodo, scala del pet, piedi del pet (riferimento 1280x720) o None, testa del
    # pet (per il primo piano) o None, ingresso (dx, dy), primo e ultimo fotogramma dell'ingresso
    spec = [('Panel1', '1Pet', 4.2, (335, 350), None, (-120, 0), 1, 4),
            ('Panel2', '2Pet', 6.5, None, (840, 140), (520, 0), 4, 7),
            ('Panel3', '3Pet', 3.9, (800, 545), None, (1100, 0), 7, 10),
            ('Panel4', 'Panel4', None, None, None, (0, -160), 10, 13)]
    for pname, node, scale, feet, head, (dx, dy), f0, f1 in spec:
        x0, y0, w, h, _pts = fx.panel_geometry(pname)
        x, y = round(x0), round(640 - y0 - h)
        kids = [I('Bg', w / 2, h / 2, w, h, 'PetTraining_%s.png' % pname, s9=False)]
        if scale:
            mask = 'PetTraining_%sMask.png' % pname
            kids += [I('Pet_Shadow', w / 2 + 6, h / 2 - 6, w, h, mask, s9=False),
                     I('Pet', w / 2, h / 2, w, h, mask, s9=False)]
        panels.append(P(node, x, y, w, h, kids))
        if scale:
            if head:
                fxm, fym = fx.pet_feet_for_head(scale, *in_mask(pname, *head))
            else:
                fxm, fym = in_mask(pname, *feet)
            px, py = fx.pet_parameter(scale, fxm, fym)
            panels.append(P('%s_parameter' % node[0], px, py, 10, 10, visible=False, scale=scale))
        nodes.append((node, [_action_frame(0, x + dx, y + dy, opacity=0), _action_frame(f0, x + dx, y + dy, opacity=0),
                             _action_frame(f1, x, y), _action_frame(36, x, y)]))
    # pet intero che corre nella fascia da destra a sinistra (piedi poco sopra il bordo basso
    # della fascia: (0, 505) -> (1280, 590)), con piccoli balzi
    def run_at(xr, hop):
        lx, ly = fx.ref_to_layout(xr, 505 + 0.0664 * xr - 22)
        return round(lx), round(640 - ly + hop)
    start = run_at(1500, 0)
    run = [_action_frame(0, *start, 3.4), _action_frame(11, *start, 3.4)]
    for k, f in enumerate(range(12, 32, 2)):
        xr = 1500 - (f - 12) * 95
        run.append(_action_frame(f, *run_at(xr, 16 if k % 2 else 0), 3.4))
    run.append(_action_frame(36, *run_at(1500 - 19 * 95, 0), 3.4))
    nodes.append(('4Pet', run))
    # dissolvenza nel bianco alla fine (poi Kakusei_Get1 sul dettaglio della medaglia)
    nodes.append(('Fade', [_action_frame(0, -300, -200, 1.0, 0), _action_frame(32, -300, -200, 1.0, 0),
                           _action_frame(35, -300, -200, 1.0, 255), _action_frame(36, -300, -200, 1.0, 255)]))
    white = dict(colorType=1, bgColorR=255, bgColorG=255, bgColorB=255, bgColorOpacity=255)
    root = build(P('PetTrainingProduction_root', 0, 0, 960, 640, [
        P('Back', -300, -200, 1560, 1040, opts=white),
        *panels,
        P('4Pet', *start, 10, 10, scale=3.4),
        P('Fade', -300, -200, 1560, 1040, opts=dict(white, opacity=0))]))
    nodes = [{'classname': None, 'name': n, 'ActionTag': find(root, n)['options']['actiontag'], 'actionframelist': fl}
             for n, fl in nodes]
    data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
    data['animation'] = {'classname': None, 'name': 'AnimationManager', 'actionlist': [
        {'classname': None, 'name': 'Training_Anime', 'actionnodelist': nodes, 'loop': False, 'unittime': 0.1}]}
    data['widgetTree'] = root
    return data


def pet_rename_popup():
    """PetInfo_Rename_ver230 (nome del pet, «Name» del dialog SPIRIT: Button_A), assente da ogni risorsa. Stessi nomi del popup Nome del Profilo offline
    (Offline_AvatarInfo_Comment, originale), cercati: Txt_Name (106110501 «Name»), Txt_Name_Label (TextField: lo sostituiscono
    col campo vero, lunghezza massima = misc 134), Txt_Limit1 (100100037 «Max %d char.»),
    Txt_Caution (102300007), Button_Close con Txt_Cancel (100100002) = annulla,
    Button_Ok con Txt_OK (100100001) = conferma (nome vuoto -> 102300003, poi
    POST /pet/name). Aspetto come Name/Message del Profilo (avatar_comment_popup:
    reference\\profile\\profile_13.png): riquadro scuro del nome, Cancel arancione e OK rosso."""
    d = json.load(open(os.path.join(SRC, *PUB.split('/'), 'Offline_AvatarInfo_Comment.json'), encoding='utf-8-sig'))
    t = d['widgetTree']
    find(t, 'NormalText_Window03')['options'].update(
        y=320, width=764, height=340, scale9Width=764, scale9Height=340, scale9Enable=True,
        capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    find(t, 'AV_Name')['options'].update(x=0, y=48, width=405, height=85, scale9Width=405, scale9Height=85, **GRID)
    find(t, 'Txt_Name_Label')['options'].update(width=380, height=40, areaWidth=380, areaHeight=40, fontSize=26,
                                                hAlignment=1, vAlignment=1)
    find(t, 'Txt_Name')['options'].update(x=-196, y=118, text='')
    find(t, 'Txt_Limit1')['options'].update(x=133, y=118)
    find(t, 'Txt_Caution')['options'].update(x=0, y=-18, fontSize=18)
    find(t, 'Button_Ok')['options'].update(
        x=153, y=-112, width=205, height=62, scale9Width=205, scale9Height=62,
        normalData=tex('But01_Off.png'), pressedData=tex('But01_On.png'), disabledData=tex('But01_Disable.png'), **BUT9)
    cancel = find(t, 'Button_Close')
    cancel['options'].update(x=-155, y=-112, width=205, height=62, scale9Width=205, scale9Height=62,
                             normalData=tex('But03_Off.png'), pressedData=tex('But03_On.png'),
                             disabledData=tex('But03_Off.png'), **BUT9)
    find(t, 'Txt_OK')['options'].update(text='OK', fontSize=28)
    cancel['children'] = [build(L('Txt_Cancel', 0, 3, 170, 50, 'Cancel', 28))]
    return d


def avatar_comment_popup():
    """AvatarInfo_Comment_ver132 e _U13_ver132 (popup Name/Message del Profilo;
    conferma), assenti dalle risorse. Base: Offline_AvatarInfo_Comment
    (originale: finestra, AV_Name con il TextField Txt_Name_Label, Txt_Limit1, Txt_Caution,
    Button_Ok, Button_Close). Il codice cerca anche Txt_Comment, Txt_Limit2, il TextField
    Txt_Comment_Label (e TextField_Comment nella conferma), Txt_Comment_Label_U13, Txt_OK e
    Txt_Cancel: «Cancel» e' Button_Close. Aspetto da reference\\profile\\profile_13.png
    (finestra x' 105-535, y' 45-310; nome e messaggio in riquadri scuri; Cancel arancione e
    OK rosso in basso)."""
    d = json.load(open(os.path.join(SRC, *PUB.split('/'), 'Offline_AvatarInfo_Comment.json'), encoding='utf-8-sig'))
    t = d['widgetTree']
    win = find(t, 'NormalText_Window03')['options']
    win.update(y=324, width=764, height=471, scale9Width=764, scale9Height=471, scale9Enable=True,
               capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    name_box = find(t, 'AV_Name')['options']
    name_box.update(x=0, y=145, width=405, height=85, scale9Width=405, scale9Height=85, **GRID)
    # area grande quanto il riquadro, testo al centro come nel riferimento
    center = dict(hAlignment=1, vAlignment=1)
    find(t, 'Txt_Name_Label')['options'].update(width=380, height=40, areaWidth=380, areaHeight=40, fontSize=26, **center)
    # Txt_Name e Txt_Comment sono i titoli dei due riquadri (il codice scrive «Message» nel
    # secondo); crea accanto a Txt_Name_Label e Txt_Comment_Label una Text con
    # le stesse proprieta' in cui la callback dei campi copia il testo
    find(t, 'Txt_Name')['options'].update(x=-196, y=204, text='')
    find(t, 'Txt_Limit1')['options'].update(x=133, y=204)
    find(t, 'Txt_Caution')['options'].update(x=0, y=88, fontSize=18)
    # riquadro del messaggio: copia di AV_Name col TextField Txt_Comment_Label (
    # lo sostituisce con il campo vero e nasconde l'originale)
    clone(t, 'AV_Name', 'AV_Comment', 'NormalText_Window03', visible=True)
    box = find(t, 'AV_Comment')
    box['options'].update(y=-40, height=133, scale9Height=133)
    tf = box['children'][0]
    tf['options']['name'] = tf['name'] = 'Txt_Comment_Label'
    tf['options'].update(height=110, areaWidth=380, areaHeight=110, fontSize=24, maxLength=20, **center)
    ok = find(t, 'Button_Ok')['options']
    ok.update(x=153, y=-182, width=205, height=62, scale9Width=205, scale9Height=62,
              normalData=tex('But01_Off.png'), pressedData=tex('But01_On.png'), disabledData=tex('But01_Disable.png'),
              **BUT9)
    cancel = find(t, 'Button_Close')
    cancel['options'].update(x=-155, y=-182, width=205, height=62, scale9Width=205, scale9Height=62,
                             normalData=tex('But03_Off.png'), pressedData=tex('But03_On.png'),
                             disabledData=tex('But03_Off.png'), **BUT9)
    find(t, 'Txt_OK')['options'].update(text='OK', fontSize=28)
    winw = find(t, 'NormalText_Window03')
    cancel['children'] = [build(L('Txt_Cancel', 0, 3, 170, 50, 'Cancel', 28))]
    winw['children'] += [build(s) for s in (
        L('Txt_Comment', -142, 54, 200, 30, 'Message', 22, opts=dict(anchorPointX=0.5)),
        L('Txt_Limit2', 133, 54, 150, 20, 'Max 20 char.', 16),
        L('Txt_Comment_Label_U13', 0, -40, 380, 110, '', 24, visible=False))]
    return d


def other_menu():
    """MenuDialog_ver300 («Other» del menu), assente dalle risorse. Base:
    MenuDialog_ver150 (originale KHUX: finestra Win11, griglia 3 x 5 di pulsanti con icona
    Menu_But_NN e testo). La ver300 cerca in piu' Achievement (con Image_android, l'icona
    Google Play al posto di quella di Game Center) e TitleButton (ritorno al titolo); non
    cerca SerialCodeButton, Movie e i pulsanti Facebook (nascosti). Icone assenti: dalla
    variante dark_Menu_But_NN dove esiste; Album (04) = Menu_But_18."""
    d = json.load(open(os.path.join(SRC, *PUB.split('/'), 'MenuDialog_ver150.json'), encoding='utf-8-sig'))
    t = d['widgetTree']
    swap = {'Menu_But_04.png': 'Menu_But_18.png'}
    swap.update({'Menu_But_%s.png' % n: 'dark_Menu_But_%s.png' % n for n in ('01', '08', '10', '11', '15')})

    def walk(w):
        o = w.get('options', {})
        fd = o.get('fileNameData')
        if isinstance(fd, dict) and fd.get('path') in swap:
            o['fileNameData'] = tex(swap[fd['path']])
        for c in w.get('children', []):
            walk(c)
    walk(t)
    for n in ('SerialCodeButton', 'FaceBookButton', 'FaceBookButton_Logout'):
        find(t, n)['options']['visible'] = False
    win = find(t, 'MainMenu_Dialog')
    # cerca anche TwitterButton con il figlio Image (banco ot3): copia nascosta
    # del pulsante Facebook
    tw = json.loads(json.dumps(find(t, 'FaceBookButton')))
    tw['options'].update(name='TwitterButton', visible=False)
    tw['name'] = 'TwitterButton'
    win['children'].append(tw)
    # Achievement al posto di Serial Code, TitleButton nell'ultima riga (copie di un pulsante
    # della griglia con icona e testo propri)
    for name, x, y, icon, text in (('Achievement', 274, 100, 'Menu_But_16.png', 'Achievements'),
                                   ('TitleButton', -274, -206, 'Menu_But_17.png', 'Title Screen')):
        b = json.loads(json.dumps(find(t, 'HelpButton')))
        b['options'].update(name=name, x=x, y=y)
        b['name'] = name
        img, lab = b['children']
        img['options']['fileNameData'] = tex(icon)
        lab['options']['text'] = text
        if name == 'Achievement':
            andr = json.loads(json.dumps(img))
            andr['options'].update(name='Image_android', fileNameData=tex('Menu_But_16_a.png'), visible=False)
            andr['name'] = 'Image_android'
            b['children'].append(andr)
        win['children'].append(b)
    return d


def subslot_scene():
    """DeckEditSubSlotScene_ver340: la ver310 originale (nodi Set_Medal x=0,
    Select_Medal x=530 con la freccia Arrow01, SubSlot_UpArrowEff = armatura
    DeckEdit_KBStrength_ResultArrow_Animation, SubSlot_Caution) con il Set_Medal ver340 generato
    (la ver260 servita non ha i testi che il codice cerca)."""
    data = json.load(open(os.path.join(SRC, *PUB.split('/'), 'DeckEditSubSlotScene_ver310.json'),
                          encoding='utf-8-sig'))
    for g in data['gameobjects']:
        if g['name'] == 'DeckEdit_SubSlot_Set_Medal':
            g['components'][0]['fileData']['path'] = 'publish/DeckEdit_SubSlot_Set_Medal_ver340.json'
    data['components'][0]['scenename'] = 'DeckEditSubSlotScene_ver340'
    return data


def pet_info_scene():
    """PetInfo_Gen_ver320, layout del nodo CenterUI di PetInfoScene_ver320 (dialog «SPIRIT» del pet: open dopo GET
    /user/profile (5) e GET /pet/profile (170) createLayout), assente da ogni risorsa.
    Nomi (ricerca ricorsiva prima in profondita': il Close_Button principale va
    prima dei popup che hanno il loro) e tipi dal client:
    - Pet_Info: Txt_Pet_Name (nome), Txt_Pet_Rank (106110102 «Rank»),
      Txt_Pet_Rank_Num (106110103 «%d»): Label (ombra). AtlasLabel_EXP (crenatura) e Gauge_EXP (09d4: ProgressBar_EXP, ProgressBar_RED,
      Gage_EXP_Res, AtlasLabel_EXP) = barra «LV Up in N» copiata da MedalInfo_Mix_ver340.
    - PetInfo_Medal: Txt_5 («×%01.3f», 106110207 = magnification del rango), Area_Arrow1/2 (vi
      aggiunge le armature DeckEdit_KBStrength_ResultArrow_Animation, freccia su).
    - Pet_LvUp (banner RANK UP!: Panel_img, Txt_Skill, Icon_New), mosso solo dall'azione «Panel_in»
      di PetInfo_PetLvUp_Panel_Ver230.json (NULL tollerato): nascosto.
    - UnderUI > Button_A/Txt_A (106110203 «Name») e Button_B/Txt_B (106110204 «Outfits»);
      PowerUp_Button/Txt_PowerUP (106110205 «Gear»), PetSkill_Button/Txt_PetSkill (106110206
      «Tricks»), Close_Button: tutti Button (setTouchEnabled).
    - PetTraing (Spirit Training/0090e660/0090dca4): PetTraing_But/Txt_Training
      (106200400 «Train»), PetTraing_ChargButton/Txt_TrainingCharg (106200401 «Train Now»),
      PetTraing_Slot/Txt_PetSkill (106200429 «Training Slots»), Txt_TotalTitle/TotalNum_Label,
      Txt_MonthTitle/MonthNum_Label (106200402/403, expeditionTotal/MonthlyNum), Txt_Time
      (106200404 «Training Ready in %02d:%02d:%02d»), Icon_New.
    - MedalArea > Medal1..Medal6 (vi aggiunge le celle medaglia 175x175 senza
      controllo del null) + subslotView creato dal codice al centro di MedalArea.
    - Dummy > Pet: il codice vi aggiunge il pet (nodo petNode) in movimento wait.
    - Pop_MedalForm (Gear; il nome «Scroll_Area» e' la coda della stringa
      EquipSell_Scroll_Area+10: con EquipSell_Scroll_Area NULL e crash, «Swap Gear» lo apre subito): Win_under >
      Scroll_Area (lista medaglie modo 8, celle 120x164, 3 colonne),
      Txt_Possession (101510001 «Slots»), Txt_Cost_Label, Txt_Slash_Label, Txt_CostMax_Label;
      Close_Button, BestButton > Txt_Best (106110301 «Optimize»), Arrow01. Win_under e' anche il
      riquadro di rilascio del trascinamento. Come DeckEdit_MedalForm.
    - Pop_PetSkill_Info (Tricks): Win (animazione d'apertura), Close_Button,
      PetSkill_List > Area (lista) e Txt (106110903 «No learned tricks.»).
    Aspetto da reference\\pet\\pet_spirit_training_02.png (1764x992: x = x'/1,553 - 88,
    y = 640 - y'/1,55) e pet_spirit_edit_01.jpg (Gear: finestra MEDALS a destra, Optimize, «<»)."""
    win4 = dict(scale9Enable=True, capInsetsX=50, capInsetsY=60, capInsetsWidth=1, capInsetsHeight=200)
    # Plate13 e' 487x36: bordi di 50 a sinistra e a destra (con capInsetsWidth 1 il bordo destro
    # restava di 436 e la striscia del Rank, larga 362, usciva dal dialog: segnalazione utente 12-10)
    plate13 = dict(scale9Enable=True, capInsetsX=50, capInsetsY=0, capInsetsWidth=387, capInsetsHeight=36)
    yellow = dict(colorR=255, colorG=220, colorB=40)
    # sei celle 3x2 come nel riferimento; MedalArea in 10,85. La cella (
    #, DeckEdit_RevolverMedal_ver330 175x175) sta con l'angolo in basso a sinistra
    # sull'origine di Medal%d e nessun codice ne cambia la scala: la scala di Medal%d la rimpicciolisce.
    # Riferimenti riportati a 960x640 (pet_spirit_yt_03 / _edit_01, banco 12-10 pt_4/pt_5):
    # monete vuote ~110 di diametro (le nostre 118, medaglie ~180 contro ~165: piu' grandi e
    # sovrapposte), centri x 98/251/404, y 345/175 (le nostre 95/250/405, 356/180). Scala 0.9:
    # centro della cella a 175 * 0.9 / 2 = 79 dall'origine.
    MS = 0.9
    medals = [P('Medal%d' % (i + 1), 88 + 153 * (i % 3) - 79, 260 - 170 * (i // 3) - 79, 175, 175,
                opts=dict(scaleX=MS, scaleY=MS)) for i in range(6)]
    root = build(P('PetInfoScene', 0, 0, 960, 640, [
        I('Win_Main', 480, 346, 936, 562, 'Win04.png', opts=win4),
        # logo «SPIRIT» (lettere rosa, stelle gialle): nessuna texture servita, testo e stelle
        L('Txt_Logo', 190, 594, 330, 70, 'SPIRIT', 52, opts=dict(colorR=240, colorG=120, colorB=235)),
        I('Star_1', 40, 612, 26, 26, 'rare_star.png', s9=False, scale=1.6),
        I('Star_2', 338, 620, 26, 26, 'rare_star.png', s9=False, scale=1.2),
        I('Star_3', 355, 566, 26, 26, 'rare_star.png', s9=False, scale=1.0),
        B('Close_Button', 937, 616, 70, 70, 'But_Close'),
        P('Pet_Info', 15, 470, 365, 80, [
            I('Name_Plate', 182, 54, 362, 40, 'Plate13.png', opts=plate13),
            L('Txt_Pet_Name', 120, 54, 200, 34, '', 26),
            L('Txt_Pet_Rank', 262, 52, 80, 30, 'Rank', 22),
            L('Txt_Pet_Rank_Num', 322, 56, 60, 40, '1', 34, opts=yellow)]),
        # sagoma a testa di gatto (cornice dello slot del pet di Equipment, nera) attenuata, dietro
        # alle medaglie (fuori da PetInfo_Medal: il codice vi cerca solo Txt_5 e Area_Arrow1/2)
        I('Emblem', 485, 555, 340, 340, 'DeckEdit_Pet1.png', s9=False, scale=0.45, opts=dict(opacity=150)),
        P('PetTraing', 585, 460, 360, 170, [
            L('Txt_Time', 170, 145, 350, 30, 'Training Ready in 00:00:00', 24),
            B('PetTraing_Slot', 70, 94, 176, 68, 'But03', 'Training Slots', 22, label='Txt_PetSkill', opts=BUTS),
            B('PetTraing_ChargButton', 258, 94, 264, 68, 'But03', 'Train Now', 30, label='Txt_TrainingCharg',
              opts=BUTS),
            B('PetTraing_But', 258, 94, 264, 68, 'But03', 'Train', 30, label='Txt_Training', opts=BUTS,
              visible=False),
            I('Icon_New', 350, 118, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6, visible=False),
            I('Total_Plate', 180, 47, 350, 28, 'Plate03.png', opts=PLATE3),
            L('Txt_TotalTitle', 18, 47, 220, 26, 'Training Total', 20, opts=dict(anchorPointX=0)),
            L('TotalNum_Label', 346, 47, 100, 26, '0', 22, opts=dict(anchorPointX=1)),
            I('Month_Plate', 180, 15, 350, 28, 'Plate03.png', opts=PLATE3),
            L('Txt_MonthTitle', 18, 15, 240, 26, "This Month's Training", 20, opts=dict(anchorPointX=0)),
            L('MonthNum_Label', 346, 15, 100, 26, '0', 22, opts=dict(anchorPointX=1))]),
        P('MedalArea', 10, 85, 500, 370, medals),
        # moltiplicatore DOPO MedalArea: disegnato sopra le ali delle medaglie della prima riga
        # (banco 12-10 pt_5: «×3.700» coperto dalla medaglia 3), come nei riferimenti
        P('PetInfo_Medal', 390, 455, 190, 175, [
            L('Txt_5', 95, 26, 180, 40, '×1.000', 30),
            P('Area_Arrow1', 172, 26, 10, 10),
            P('Area_Arrow2', 172, 46, 10, 10)]),
        # pet a destra, grande e coi piedi sul fondo della finestra: nei riferimenti (yt_03,
        # training_02) ~190-275 di altezza, centro x ~740, piedi a y ~95; il nostro a scala 2
        # era alto ~140 (pt_3), coi piedi a 115. Il nodo Pet ha i piedi sull'origine.
        P('Dummy', 560, 85, 385, 370, [P('Pet', 170, 10, 10, 10, opts=dict(scaleX=2.7, scaleY=2.7))]),
        # linguette in basso (fuori dalla finestra, come nel riferimento): rosse, Tricks arancione
        P('UnderUI', 0, 0, 560, 64, [
            B('Button_A', 147, 30, 337, 68, 'But01', 'Name', 30, label='Txt_A', opts=BUTS),
            B('Button_B', 416, 30, 342, 68, 'But01', 'Outfits', 30, label='Txt_B', opts=BUTS)]),
        B('PowerUp_Button', 650, 30, 246, 68, 'But01', 'Gear', 30, label='Txt_PowerUP', opts=BUTS),
        B('PetSkill_Button', 847, 30, 248, 68, 'But03', 'Tricks', 30, label='Txt_PetSkill', opts=BUTS),
        P('Pet_LvUp', 180, 280, 600, 160, [
            P('Panel_img', 0, 0, 600, 160),
            I('LvUp_Base', 300, 80, 600, 110, 'Plate13.png', opts=plate13),
            L('Txt_RankUp', 300, 108, 400, 50, 'RANK UP!', 40, opts=dict(colorR=255, colorG=120, colorB=40)),
            I('Skill_Plate', 300, 52, 300, 34, 'Plate03.png', opts=PLATE3),
            L('Txt_Skill', 300, 52, 280, 30, '', 22),
            I('Icon_New', 470, 64, 69, 30, 'Deck_Medal_New.png', s9=False, scale=0.6)], visible=False),
        # Gear: finestra MEDALS a destra (pet_spirit_edit_01: x 555..945, fino in fondo: copre Gear/Tricks,
        # che il codice disabilita in modalita' Gear), come DeckEdit_MedalForm
        P('Pop_MedalForm', 555, 2, 390, 628, [
            I('Win_under', 195, 314, 380, 618, 'Panel04.png', opts=PANEL4, children=[
                I('Win', 0, 0, 386, 628, 'Panel15.png', opts=PANEL15),
                I('Logo', -125, 286, 113, 19, 'Deck_Title_MD.png', s9=False),
                I('Plate_Possession_Medal', 52, 286, 210, 25, 'Plate03.png', opts=PLATE3),
                L('Txt_Possession', -40, 286, 100, 20, 'Slots', 16, opts=dict(anchorPointX=0)),
                L('Txt_Cost_Label', 100, 286, 50, 18, '0', 16, opts=dict(anchorPointX=1)),
                L('Txt_Slash_Label', 106, 286, 12, 18, '/', 16),
                L('Txt_CostMax_Label', 112, 286, 50, 18, '0', 16, opts=dict(anchorPointX=0)),
                P('Scroll_Area', -185, -298, 370, 566),
                B('Close_Button', 182, 302, 70, 70, 'But_Close')]),
            I('Arrow01', -7, 298, 56, 134, 'Medal_Syn_Arrow01.png', s9=False, scale=0.8),
            B('BestButton', -50, 118, 196, 68, 'But06', 'Optimize', 24, label='Txt_Best', opts=BUTS)],
          visible=False),
        # Tricks: il pulsante chiama su Pop_PetSkill_Info, che vi
        # cerca PetSkill_Info (dettaglio, lo nasconde: senza, crash) e PetSkill_List > Area (lista
        # celle PetInfo_PetSkill_Panel_ver230 304x68) e Txt («No learned tricks.»,
        # elenco = openSkillIds della riga petRank del rango). Toccando un trick
        # mostra PetSkill_Info e vi scrive Txt_PetSkill_Title (nome), Txt_Efficacy_Title
        # (106110901 «Details»), Txt_Efficacy, Txt_Trigger_Title (106110902 «Conditions»), Txt_Trigger
        # (riga petSkill); ritoccarlo lo nasconde. Lista a sinistra, dettaglio a destra.
        P('Pop_PetSkill_Info', 0, 0, 960, 640, [
            I('Win', 480, 330, 760, 480, 'Win04.png', opts=win4, children=[
                L('Txt_Title', -350, 205, 300, 40, 'TRICKS', 30, opts=dict(anchorPointX=0)),
                B('Close_Button', 365, 225, 70, 70, 'But_Close'),
                I('List_Base', -195, -20, 340, 410, 'Panel04.png', opts=GRID),
                # la lista prende la misura di Area (setContentSize, addChild) e mette
                # le celle da 304 a x 0: Area larga quanto la cella e centrata nel riquadro
                P('PetSkill_List', -360, -220, 330, 400, [
                    P('Area', 13, 0, 304, 400),
                    L('Txt', 165, 200, 300, 40, 'No learned tricks.', 22, visible=False)]),
                P('PetSkill_Info', -10, -225, 370, 410, [
                    I('Info_Base', 185, 205, 370, 410, 'Panel04.png', opts=GRID),
                    L('Txt_PetSkill_Title', 185, 375, 340, 36, '', 26, opts=dict(colorR=255, colorG=230, colorB=60)),
                    I('Efficacy_Plate', 185, 330, 340, 28, 'Plate03.png', opts=PLATE3),
                    L('Txt_Efficacy_Title', 25, 330, 200, 26, 'Details', 20, opts=dict(anchorPointX=0)),
                    L('Txt_Efficacy', 20, 305, 330, 130, '', 20,
                      opts=dict(anchorPointX=0, anchorPointY=1, ignoreSize=False, hAlignment=0, vAlignment=0)),
                    I('Trigger_Plate', 185, 150, 340, 28, 'Plate03.png', opts=PLATE3),
                    L('Txt_Trigger_Title', 25, 150, 200, 26, 'Conditions', 20, opts=dict(anchorPointX=0)),
                    L('Txt_Trigger', 20, 125, 330, 110, '', 20,
                      opts=dict(anchorPointX=0, anchorPointY=1, ignoreSize=False, hAlignment=0, vAlignment=0))],
                  visible=False)])],
          visible=False)]))
    # barra «LV Up in N» originale (Gage_Exp_Base, ProgressBar_EXP/RED, Gage_EXP_Res «LV Up in»,
    # AtlasLabel_EXP Topinfo_Num) da MedalInfo_Mix_ver340, allargata a 342 sotto la targa del nome
    mix = json.load(open(os.path.join(SRC, *PUB.split('/'), 'MedalInfo_Mix_ver340.json'), encoding='utf-8-sig'))
    gauge = json.loads(json.dumps(find(mix['widgetTree'], 'Gauge_EXP')))
    w = 342
    gauge['options'].update(x=182, y=14, width=w, scale9Width=w)
    for c in gauge['children']:
        o = c['options']
        if o['name'] in ('ProgressBar_EXP', 'ProgressBar_RED'):
            o.update(x=-w / 2 + 1, width=w - 2, scale9Width=w - 2)
        elif o['name'] == 'Gauge_EXP_Frame':           # cornice: 349 su 332 nell'originale
            o.update(width=w + 17, scale9Width=w + 17)
        elif o['name'] == 'AtlasLabel_EXP':
            o.update(x=w / 2 - 2, y=18)
        elif o['name'] == 'Gage_EXP_Res':
            o.update(x=w / 2 - 40, y=18)
    find(root, 'Pet_Info')['children'].append(gauge)
    data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
    data['widgetTree'] = root
    return data


def frame_armature(name, png, tsize, c, w, h, off, plist_name=None):
    """Armatura (ExportJson + plist) che disegna una cornice w x h da una texture di cornice
    tsize: 4 angoli c x c e 4 lati (fette di 10 px dal centro della texture) scalati solo
    lungo il lato. Movimento Animation1 fermo. Restituisce (ExportJson, testo del plist)."""
    tw, th = tsize
    mx, my = tw // 2 - 5, th // 2 - 5
    pieces = {   # nome: (x, y, larghezza, altezza) nella texture (y verso il basso)
        'TL': (0, 0, c, c), 'TR': (tw - c, 0, c, c), 'BL': (0, th - c, c, c), 'BR': (tw - c, th - c, c, c),
        'T': (mx, 0, 10, c), 'B': (mx, th - c, 10, c), 'L': (0, my, c, 10), 'R': (tw - c, my, c, 10)}
    hx, hy, k = w / 2 - c / 2, h / 2 - c / 2, c / 2
    place = {    # nome: (x, y, scala x, scala y) dell'osso, y verso l'alto
        'TL': (-hx, hy, 1, 1), 'TR': (hx, hy, 1, 1), 'BL': (-hx, -hy, 1, 1), 'BR': (hx, -hy, 1, 1),
        'T': (0, hy, (w - 2 * c) / 10, 1), 'B': (0, -hy, (w - 2 * c) / 10, 1),
        'L': (-hx, 0, 1, (h - 2 * c) / 10), 'R': (hx, 0, 1, (h - 2 * c) / 10)}
    del k
    frame = lambda n: '%s_%s.png' % (name, n)
    bones, movs, texd = [], [], []
    for z, (n, (x, y, sx, sy)) in enumerate(place.items()):
        # numeri decimali come negli ExportJson originali: il lettore controlla il tipo
        bones.append({'name': n, 'parent': '', 'dI': 0, 'x': float(x + off[0]), 'y': float(y + off[1]), 'z': z,
                      'cX': float(sx), 'cY': float(sy), 'kX': 0.0, 'kY': 0.0, 'arrow_x': 0.0, 'arrow_y': 0.0,
                      'effectbyskeleton': False, 'bl': 0,
                      'display_data': [{'name': frame(n), 'displayType': 0, 'skin_data': [
                          {'x': 0.0, 'y': 0.0, 'cX': 1.0, 'cY': 1.0, 'kX': 0.0, 'kY': 0.0}]}]})
        key = {'dI': 0, 'x': 0.0, 'y': 0.0, 'z': z, 'cX': 1.0, 'cY': 1.0, 'kX': 0.0, 'kY': 0.0,
               'twE': 0, 'tweenFrame': True, 'bd_src': 1, 'bd_dst': 771}
        # pulsazione come Cursor_Anim_Partner: opacita' 128 -> 255 -> 128 in 60 fotogrammi
        # (nel video della vendita il riquadro pulsa con un ciclo al secondo)
        col = lambda a: {'a': a, 'r': 255, 'g': 255, 'b': 255}
        movs.append({'name': n, 'dl': 0.0, 'frame_data': [
            dict(key, fi=0, color=col(128)), dict(key, fi=30, color=col(255)), dict(key, fi=60, color=col(128))]})
        texd.append({'name': frame(n)[:-4], 'width': float(pieces[n][2]), 'height': float(pieces[n][3]),
                     'pX': 0.5, 'pY': 0.5, 'plistFile': ''})
    plist_name = plist_name or name + '0.plist'
    ej = {'content_scale': 1.0,
          'armature_data': [{'strVersion': '1.6.0.0', 'version': 1.6, 'name': name, 'bone_data': bones}],
          'animation_data': [{'name': name, 'mov_data': [{'name': 'Animation1', 'dr': 61, 'lp': True, 'to': 0,
                                                          'drTW': 0, 'twE': 0, 'sc': 1.0, 'mov_bone_data': movs}]}],
          'texture_data': texd, 'config_file_path': [plist_name], 'config_png_path': [png]}
    # plist come quelli di CocoStudio (tabulazioni, una chiave per riga): scritto su una
    # riga sola il client non mostrava l'armatura
    frames = {frame(n): {'width': pw, 'height': ph, 'originalWidth': pw, 'originalHeight': ph,
                         'x': px, 'y': py, 'offsetX': 0.0, 'offsetY': 0.0}
              for n, (px, py, pw, ph) in pieces.items()}
    plist = plistlib.dumps({'frames': frames,
                            'metadata': {'format': 0, 'textureFileName': png, 'realTextureFileName': png,
                                         'size': '{%d,%d}' % (tw, th)},
                            'texture': {'width': tw, 'height': th}}, sort_keys=False).decode('utf-8')
    return ej, plist_name, plist


os.makedirs(os.path.join(OUT, *PUB.split('/')), exist_ok=True)
for target, spec in LAYOUTS.items():
    if spec[0] == 'scene':
        data, how = scene(spec[1]), 'scena'
    elif spec[0] == 'func':
        data, how = globals()[spec[1]](), 'funzione ' + spec[1]
    elif spec[0] == 'frame':
        data, plist_name, plist = frame_armature(*spec[1:])
        with open(os.path.join(OUT, *PUB.split('/'), plist_name), 'w', encoding='utf-8', newline='') as fh:
            fh.write(plist)
        # il client usa la texture col nome del plist (.plist -> .png), non quella indicata:
        # la si copia anche con quel nome
        png_name = plist_name[:-len('.plist')] + '.png'
        if png_name != spec[2]:
            shutil.copyfile(os.path.join(SRC, *PUB.split('/'), spec[2]), os.path.join(OUT, *PUB.split('/'), png_name))
            data['config_png_path'] = [png_name]
        how = 'cornice 9-slice da ' + spec[2]
    elif spec[0] == 'armature':
        data = json.load(open(os.path.join(SRC, *PUB.split('/'), spec[1]), encoding='utf-8-sig'))
        data['armature_data'][0]['name'] = spec[2]
        data['animation_data'][0]['name'] = spec[2]
        for mv in data['animation_data'][0]['mov_data']:
            mv['name'] = spec[3].get(mv['name'], mv['name'])
        if len(spec) > 4:               # plist copiato con un nome nuovo
            shutil.copyfile(os.path.join(SRC, *PUB.split('/'), data['config_file_path'][0]),
                            os.path.join(OUT, *PUB.split('/'), spec[4]))
            data['config_file_path'] = [spec[4]]
        how = 'armatura da ' + spec[1]
    elif spec[0] == 'build':
        data = {k: v for k, v in _tmpl.items() if k != 'widgetTree'}
        data['widgetTree'] = build(spec[1])
        how = 'costruito'
    else:
        data = json.load(open(os.path.join(SRC, *PUB.split('/'), spec[1]), encoding='utf-8-sig'))
        rename(data['widgetTree'], spec[2])
        if len(spec) > 3 and spec[3]:
            retex(data['widgetTree'])
        for extra in (spec[4] if len(spec) > 4 else ()):
            if isinstance(extra, tuple) and extra[0] == 'text':     # ('text', nome, testo)
                find(data['widgetTree'], extra[1])['options']['text'] = extra[2]
            elif isinstance(extra, tuple) and extra[0] == 'tex':
                # ('tex', nome, texture|None[, {opzioni, es. scale9 come nei layout originali}])
                o = find(data['widgetTree'], extra[1])['options']
                if extra[2]:
                    o['fileNameData'] = tex(extra[2])
                    o.update(extra[3] if len(extra) > 3 else {})
                else:                       # texture assente ovunque: widget nascosto
                    o['fileNameData'] = tex('Plate01.png')
                    o['visible'] = False
            elif isinstance(extra, tuple) and extra[0] == 'clone_r':
                # ('clone_r', sorgente, nome, genitore, {figlio: nuovo nome}): clone nascosto
                # con i figli rinominati (riquadri che una versione successiva aggiunge)
                clone(data['widgetTree'], *extra[1:4])
                rename(find(data['widgetTree'], extra[2]), extra[4])
            elif isinstance(extra, tuple) and extra[0] == 'opts':   # ('opts', nome, {opzioni})
                find(data['widgetTree'], extra[1])['options'].update(extra[2])
            elif isinstance(extra, tuple) and extra[0] == 'add':    # ('add', genitore, widget)
                find(data['widgetTree'], extra[1])['children'].append(build(extra[2]))
            elif isinstance(extra, tuple):          # ('clone', sorgente, nome, genitore)
                clone(data['widgetTree'], *extra[1:])
            else:
                data['widgetTree']['children'].append(build(extra))
        how = 'copia di ' + spec[1]
    path = os.path.join(OUT, *PUB.split('/'), target)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False)
    print(target, '<-', how)

served = {l.split('\t')[0] for l in open(os.path.join(SRC, '..', '..', 'resource_data', 'names_v4.tsv'), encoding='utf-8')}
n_copied = 0
for dst, src in COPIES.items():
    if dst in served or not os.path.exists(os.path.join(SRC, *src.split('/'))):
        continue
    os.makedirs(os.path.dirname(os.path.join(OUT, *dst.split('/'))), exist_ok=True)
    shutil.copyfile(os.path.join(SRC, *src.split('/')), os.path.join(OUT, *dst.split('/')))
    n_copied += 1
print('file copiati:', n_copied)

os.makedirs(os.path.join(OUT, 'text', 'ui'), exist_ok=True)
for tid, s in TEXTS.items():
    with open(os.path.join(OUT, 'text', 'ui', '%d.txt' % tid), 'w', encoding='utf-8', newline='') as fh:
        fh.write(s)
print('testi ui:', len(TEXTS))
