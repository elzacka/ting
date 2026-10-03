import { describe, expect, it } from 'vitest'
import { parseReceipt, splitAmount, storeKey, type ReceiptRead } from './receipt'

const today = new Date(2026, 9, 3)

// Fake MOD11-valid organisation numbers.
const ORG_A = '123456785'
const ORG_B = '135724688'
const ORG_C = '172839401'
const ORG_D = '142536471'

const ullteppe = [
  'Nordlys Hjem',
  'NORDLYS HJEM',
  'Testveien 12',
  '1543, Vestby',
  `Org.nr ${ORG_A} MVA`,
  'Salgskvittering',
  'Dato: onsdag 1. juli 2026',
  'Artikkel  Beløp',
  'Fjellro ullteppe grå  4.299,90 kr',
  '212770200000, 140x200 cm, hvit',
  '2 x 4.299,90 kr',
  'Rabatt -4.299,90 kr (8.599,80 kr)',
  'Total  4.299,90 kr',
  'Alle ullprodukter 50%  -4.299,90 kr',
  'BAX: 40000001',
]

const ikea = [
  'Testhus Sandvika',
  'TESTHUS SANDVIKA',
  'Kjerrveien 3',
  'Holmen 1399',
  `NO${ORG_B}MVA`,
  '03.09.2026  14:32',
  'ART. NR 50500011  315,00  0',
  'BORDO bordplate 74x',
  'ART. NR 10203040  1.234,50  0',
  'HYLLO hylle hvit',
  'TOTAL NOK  1.549,50',
  'Bax: 40000002',
]

const gravering = [
  'Solglimt Optikk',
  '0150 OSLO',
  `Org.nr ${ORG_C}`,
  '2026-08-14',
  'Artikkel  Antall  Pris  Beløp',
  'Navn i',
  'KPNAVN  1,00  549,00  549,00',
  'kopp',
  'Totalbeløp  549,00',
]

const pixel = [
  '***** Salgskvittering *****',
  '1 PIXEL LYKT GRØNN LI  379,00',
  '2 STEVE FIGUR  178,00',
  'SUM  557,00',
]

describe('parseReceipt, ullteppe layout', () => {
  const r = parseReceipt(ullteppe, today)

  it('reads the item with quantity and the discount', () => {
    expect(r.lines).toEqual([{ name: 'Fjellro ullteppe grå', quantity: 2, amount: 4299.9 }])
    expect(r.total).toBe(4299.9)
    expect(r.balanced).toBe(true)
  })

  it('reads store details', () => {
    expect(r.storeName).toBe('Nordlys Hjem')
    expect(r.orgNr).toBe(ORG_A)
    expect(r.postcode).toBe('1543')
    expect(r.terminal).toBe('40000001')
    expect(r.date).toBe('2026-07-01')
  })

  it('replaces a generic second word with the place', () => {
    expect(parseReceipt(['Nordlys Outlet', '1543, VESTBY'], today).storeName).toBe('Nordlys Vestby')
  })

  it('keeps a brand plus place and prefers the mixed-case duplicate', () => {
    const r2 = parseReceipt(['NORDLYS STRANDA', 'Nordlys Stranda', '1399, Holmen'], today)
    expect(r2.storeName).toBe('Nordlys Stranda')
  })
})

describe('parseReceipt, IKEA layout', () => {
  const r = parseReceipt(ikea, today)

  it('takes the name from the line after the amount', () => {
    expect(r.lines).toEqual([
      { name: 'BORDO bordplate 74x', quantity: 1, amount: 315 },
      { name: 'HYLLO hylle hvit', quantity: 1, amount: 1234.5 },
    ])
    expect(r.total).toBe(1549.5)
    expect(r.balanced).toBe(true)
  })

  it('reads the store from a mixed-case line over the caps duplicate', () => {
    expect(r.storeName).toBe('Testhus Sandvika')
    expect(r.postcode).toBe('1399')
    expect(r.orgNr).toBe(ORG_B)
    expect(r.terminal).toBe('40000002')
    expect(r.date).toBe('2026-09-03')
  })

  it('reads N0 as NO in the org number prefix', () => {
    expect(parseReceipt([`N0${ORG_B}MVA`], today).orgNr).toBe(ORG_B)
  })
})

describe('parseReceipt, column layout with a code', () => {
  const r = parseReceipt(gravering, today)

  it('joins the name before and after the code row', () => {
    expect(r.lines).toEqual([{ name: 'Navn i kopp', quantity: 1, amount: 549 }])
    expect(r.balanced).toBe(true)
  })

  it('uses the area name for Oslo', () => {
    const withArea = ['Lun interiør', 'Holmlia senter', '1152 OSLO', ...gravering.slice(2)]
    expect(parseReceipt(withArea, today).storeName).toBe('Lun Holmlia')
    expect(r.storeName).toBe('Solglimt Optikk')
    expect(r.postcode).toBe('0150')
  })

  it('accepts 1.00 as quantity', () => {
    const noisy = gravering.map((l) => l.replace('1,00', '1.00'))
    expect(parseReceipt(noisy, today).lines[0]?.quantity).toBe(1)
  })

  it('does not treat the next item name as a continuation', () => {
    const two = [
      'Artikkel',
      'Navn i',
      'KPNAVN  1,00  549,00  549,00',
      'ring',
      'Navn i',
      'KPNAVN  1,00  99,00  99,00',
      'Total  598,00',
    ]
    expect(parseReceipt(two, today).lines.map((l) => l.name)).toEqual(['Navn i ring', 'Navn i'])
  })
})

describe('parseReceipt, leading quantity layout', () => {
  const r = parseReceipt(pixel, today)

  it('uses the leading integer as quantity and keeps the name as printed', () => {
    expect(r.lines).toEqual([
      { name: 'PIXEL LYKT GRØNN LI', quantity: 1, amount: 379 },
      { name: 'STEVE FIGUR', quantity: 2, amount: 178 },
    ])
    expect(r.total).toBe(557)
    expect(r.balanced).toBe(true)
  })

  it('joins a name and an amount split over two lines', () => {
    const split = ['Salgskvittering', '1 PIXEL LYKT GRØNN LI', '379,00', 'SUM  379,00']
    expect(parseReceipt(split, today).lines).toEqual([{ name: 'PIXEL LYKT GRØNN LI', quantity: 1, amount: 379 }])
  })

  it('reads a space as thousands separator', () => {
    const big = ['Salgskvittering', 'Sofa Fjord  4 299,90', 'Total  4 299,90 NOK']
    const rb = parseReceipt(big, today)
    expect(rb.lines[0]?.amount).toBe(4299.9)
    expect(rb.total).toBe(4299.9)
  })
})

describe('OCR noise and edge cases', () => {
  it('flags a total that does not balance', () => {
    const r = parseReceipt(['Salgskvittering', 'Lampe  100,00', 'Total  120,00'], today)
    expect(r.balanced).toBe(false)
    expect(r.total).toBe(120)
  })

  it('returns a null store name for a logo-only receipt', () => {
    const r = parseReceipt(['Salgskvittering', `Org.nr ${ORG_D}`, 'Dato: 01.09.2026', 'Artikkel', 'Kopp  49,00', 'Total  49,00'], today)
    expect(r.storeName).toBeNull()
    expect(r.orgNr).toBe(ORG_D)
    expect(r.balanced).toBe(true)
  })

  it('skips ads, phone, e-mail, url and address lines in the header', () => {
    const r = parseReceipt(
      ['Salgskvittering', 'Bli med i klubben', 'Tlf 22 33 44 55', 'post@test.no', 'www.test.no', 'Storgata 5', 'Lysbu', '3050, Mjøndalen', 'Dato 01.09.2026'],
      today,
    )
    expect(r.storeName).toBe('Lysbu Mjøndalen')
    expect(r.postcode).toBe('3050')
  })

  it('drops a future date and prefers a labelled one', () => {
    expect(parseReceipt(['Dato 04.10.2026'], today).date).toBeNull()
    expect(parseReceipt(['12.01.2026', 'Kjøpsdato: 05.02.2026'], today).date).toBe('2026-02-05')
    expect(parseReceipt(['Kjepsdato 05/02/26'], today).date).toBe('2026-02-05')
  })

  it('rejects invalid calendar dates', () => {
    expect(parseReceipt(['31.02.2026'], today).date).toBeNull()
    expect(parseReceipt(['31.02.2026', '2026-03-01'], today).date).toBe('2026-03-01')
  })

  it('rejects an organisation number that fails MOD11', () => {
    expect(parseReceipt(['123456786'], today).orgNr).toBeNull()
    expect(parseReceipt(['123 456 786'], today).orgNr).toBeNull()
    expect(parseReceipt(['123 456 785'], today).orgNr).toBe(ORG_A)
  })

  it('reads the generic second word with ø as e', () => {
    const r = parseReceipt(['Lun interior', '1543 VESTBY', `Org.nr ${ORG_A}`], today)
    expect(r.storeName).toBe('Lun Vestby')
  })

  it('reads the total line with ø as o and Å as A', () => {
    expect(parseReceipt(['Salgskvittering', 'Lampe  10,00', 'Totalbelop  10,00'], today).total).toBe(10)
    expect(parseReceipt(['Salgskvittering', 'Lampe  10,00', 'A BETALE  10,00'], today).total).toBe(10)
  })

  it('ignores everything after the total', () => {
    const r = parseReceipt(['Salgskvittering', 'Lampe  10,00', 'Total  10,00', 'Rabatt  -5,00', 'Kort  10,00'], today)
    expect(r.lines).toHaveLength(1)
    expect(r.balanced).toBe(true)
  })

  it('never throws on empty or odd input', () => {
    expect(parseReceipt([], today).lines).toEqual([])
    expect(parseReceipt(['', '   ', '\u0000', 'Total'], today).total).toBeNull()
    expect(parseReceipt([undefined as unknown as string], today).balanced).toBe(false)
  })
})

describe('real OCR line shapes', () => {
  it('reads code, name and amount on one line between two star lines', () => {
    const r = parseReceipt(
      [
        'KE',
        'NORDHUS STRANDA',
        'NORDHUS FAMILY, klubben som gir deg mer',
        'Registrer deg na pà NORDHUS.no/FAMILY',
        'NORDHUS Stranda',
        'Strandveien 40',
        'Holmen  1399',
        `N0${ORG_A}MVA`,
        '> Salgskvittering',
        'Ordrenummer  1632400000',
        '**********************************',
        'ART. NR 50500001  BORDO bordplate  74x  315,00  0',
        'ART.NR 50500002  BORDO understell 74  420,00  0',
        '**********************************',
        'Total  735,00',
        'Total artikler  2',
      ],
      today,
    )
    expect(r.lines).toEqual([
      { name: 'BORDO bordplate 74x', quantity: 1, amount: 315 },
      { name: 'BORDO understell 74', quantity: 1, amount: 420 },
    ])
    expect(r.balanced).toBe(true)
    expect(r.storeName).toBe('NORDHUS Stranda')
    expect(r.postcode).toBe('1399')
    expect(r.orgNr).toBe(ORG_A)
  })

  it('ends the items at a VAT summary line and reads a dot-decimal total', () => {
    const r = parseReceipt(
      [
        'Produkt  Antal1  Pris  Beisp',
        'Navn i',
        'KPNAVU  1,00  549,00  549,00',
        'kopp',
        'Nettobelap (NvA grunnlag):  399,20',
        'Hvorav MUn:(25.00% av 399.20)  99,80',
        'Totalbelap:  549.00',
        'Avrunding:  0.00',
        'À Betale (NOK)  549,00',
      ],
      today,
    )
    expect(r.lines).toEqual([{ name: 'Navn i kopp', quantity: 1, amount: 549 }])
    expect(r.total).toBe(549)
    expect(r.balanced).toBe(true)
  })
})

describe('storeKey', () => {
  const base: ReceiptRead = {
    storeName: null, orgNr: null, postcode: null, terminal: null, date: null, lines: [], total: null, balanced: false,
  }

  it('prefers orgNr and postcode, then orgNr, then terminal', () => {
    expect(storeKey({ ...base, orgNr: ORG_A, postcode: '1543', terminal: '1' })).toBe(`${ORG_A}:1543`)
    expect(storeKey({ ...base, orgNr: ORG_A, terminal: '1' })).toBe(ORG_A)
    expect(storeKey({ ...base, terminal: '40000001' })).toBe('bax:40000001')
    expect(storeKey(base)).toBeNull()
  })
})

describe('splitAmount', () => {
  it('gives the larger øre first and sums exactly', () => {
    expect(splitAmount(100, 3)).toEqual([33.34, 33.33, 33.33])
    expect(splitAmount(4299.9, 2)).toEqual([2149.95, 2149.95])
    expect(splitAmount(0.05, 3)).toEqual([0.02, 0.02, 0.01])
  })

  it('returns the amount for one unit and guards a bad count', () => {
    expect(splitAmount(549, 1)).toEqual([549])
    expect(splitAmount(549, 0)).toEqual([549])
  })
})

describe('a logo read as the bare brand', () => {
  it('takes the printed line with the branch over the logo and the postcode place', () => {
    const r = parseReceipt(
      ['NORDHUS', 'NORDHUS STRANDA', 'NORDHUS Stranda', 'Strandveien 40', 'Holmen  1399', 'N0123456785MVA', 'Total  10,00'],
      new Date('2026-10-01'),
    )
    expect(r.storeName).toBe('NORDHUS Stranda')
  })
})
