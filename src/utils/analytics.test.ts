import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDataSourceUrl } from './sheetsUrl';
import { parseCsv, normalizeJsonPayload, toCsvString } from './csv';
import {
  profileDataset,
  filterDatasetRows,
  computeNumericSummary,
  countTodayEntries,
  buildDistribution,
  buildTimeSeries,
  countNewIncomingRows,
  parseFlexibleTimestamp,
} from './analytics';

test('parseDataSourceUrl converts standard Google Sheets edit URL to CSV export URL', () => {
  const parsed = parseDataSourceUrl(
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=12345'
  );
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.sourceType, 'google-sheet');
  assert.equal(parsed.spreadsheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  assert.equal(parsed.gid, '12345');
  assert.equal(
    parsed.normalizedFetchUrl,
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=12345'
  );
});

test('parseDataSourceUrl handles published sheet, Apps Script web app, and Google Forms URL', () => {
  const pub = parseDataSourceUrl(
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTestSheet/pubhtml?gid=99'
  );
  assert.equal(pub.sourceType, 'google-sheet-published');
  assert.equal(
    pub.normalizedFetchUrl,
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTestSheet/pub?output=csv&gid=99'
  );

  const webApp = parseDataSourceUrl('https://script.google.com/macros/s/AKfycb123/exec');
  assert.equal(webApp.sourceType, 'web-app');
  assert.equal(webApp.isValid, true);

  const form = parseDataSourceUrl('https://docs.google.com/forms/d/1AbCdEfGhI/edit');
  assert.equal(form.sourceType, 'google-form');
  assert.equal(form.formId, '1AbCdEfGhI');
});

test('parseCsv parses quoted multiline headers and commas accurately', () => {
  const sample =
    'ประทับเวลา,ชื่อ,"5.1 ชนิดพืชใหม่\n(เลือกได้มากกว่า 1)",อายุ\r\n' +
    '"23/11/2026, 9:11:39",สมชาย,"กล้วย, ฝรั่ง, มะม่วง",55\r\n' +
    '"23/11/2026, 10:00:00",สมหญิง,"มะพร้าว, ""พิเศษ""",48\r\n';
  const parsed = parseCsv(sample);
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.headers[2], '5.1 ชนิดพืชใหม่ (เลือกได้มากกว่า 1)');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]['ประทับเวลา'], '23/11/2026, 9:11:39');
  assert.equal(parsed.rows[1]['5.1 ชนิดพืชใหม่ (เลือกได้มากกว่า 1)'], 'มะพร้าว, "พิเศษ"');

  const roundTrip = parseCsv(toCsvString(parsed.headers, parsed.rows));
  assert.equal(roundTrip.rows.length, 2);
  assert.equal(roundTrip.rows[0]['ชื่อ'], 'สมชาย');
});

test('normalizeJsonPayload handles array of objects and values matrix', () => {
  const fromObjs = normalizeJsonPayload({
    data: [
      { ชื่อ: 'ก', คะแนน: 10 },
      { ชื่อ: 'ข', คะแนน: 20 },
    ],
  });
  assert.deepEqual(fromObjs.headers, ['ชื่อ', 'คะแนน']);
  assert.equal(fromObjs.rows[1]['คะแนน'], '20');
});

test('parseFlexibleTimestamp supports DD/MM/YYYY, HH:mm:ss and Buddhist Era years', () => {
  const dt1 = parseFlexibleTimestamp('23/11/2026, 9:11:39');
  assert.ok(dt1);
  assert.equal(dt1.getFullYear(), 2026);
  assert.equal(dt1.getMonth(), 10);
  assert.equal(dt1.getDate(), 23);
  assert.equal(dt1.getHours(), 9);

  const dt2 = parseFlexibleTimestamp('23/11/2569, 14:05:00');
  assert.ok(dt2);
  assert.equal(dt2.getFullYear(), 2026);
});

test('analytics engine profiles and analyzes real Zoning 2570 attachment data', () => {
  const filePath = path.resolve(
    process.cwd(),
    'public/assets/aistudio/________________________Zoning2570______________a7556eb5'
  );
  const rawCsv = fs.readFileSync(filePath, 'utf8');
  const { headers, rows } = parseCsv(rawCsv);

  assert.equal(rows.length, 10);

  const profile = profileDataset(headers, rows);
  assert.equal(profile.timestampColumn, 'ประทับเวลา');
  assert.ok(profile.numericColumns.includes('อายุ'));
  assert.ok(profile.numericColumns.includes('3.2 ขนาดพื้นที่เข้าร่วมโครงการฯ (ไร่)'));
  assert.ok(!profile.numericColumns.includes('เลขบัตรประชาชน'));
  assert.ok(!profile.numericColumns.includes('เบอร์โทร'));
  assert.ok(profile.categoricalColumns.includes('ตำบล'));
  assert.ok(profile.multiSelectColumns.some((c) => c.includes('5.1 ชนิดพืชใหม่ที่ต้องการเปลี่ยน')));

  const areaSummary = computeNumericSummary(rows, '3.2 ขนาดพื้นที่เข้าร่วมโครงการฯ (ไร่)');
  assert.ok(areaSummary);
  assert.equal(areaSummary.sum, 20);
  assert.equal(areaSummary.average, 2);

  const todayStats = countTodayEntries(rows, profile.timestampColumn, new Date(2026, 10, 23, 12, 0, 0));
  assert.equal(todayStats.todayCount, 10);

  const filtered = filterDatasetRows(rows, profile, {
    searchQuery: '',
    dateFrom: '',
    dateTo: '',
    columnFilters: { 'ตำบล': 'โคกไทย' },
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]['ชื่อ - นามสกุล'], 'มานพ  กล้ากระโทก');

  const multiCol = profile.multiSelectColumns.find((c) => c.includes('5.1 ชนิดพืชใหม่'))!;
  const newCropDist = buildDistribution(rows, multiCol, true);
  assert.ok(newCropDist.some((d) => d.name === 'กล้วย' && d.value === 4));

  const series = buildTimeSeries(rows, profile.timestampColumn);
  assert.equal(series.granularity, 'hour');
  assert.deepEqual(
    series.points.map((p) => p.label),
    ['09:00', '10:00']
  );
  assert.equal(series.points[0].count, 4);
  assert.equal(series.points[1].count, 6);
});

test('countNewIncomingRows detects newly arrived submissions accurately', () => {
  const headers = ['ประทับเวลา', 'ชื่อ'];
  const prev = [
    { ประทับเวลา: '23/11/2026, 9:00:00', ชื่อ: 'A' },
    { ประทับเวลา: '23/11/2026, 9:05:00', ชื่อ: 'B' },
  ];
  const next = [
    ...prev,
    { ประทับเวลา: '23/11/2026, 9:10:00', ชื่อ: 'C' },
  ];
  assert.equal(countNewIncomingRows(prev, next, headers), 1);
  assert.equal(countNewIncomingRows(prev, prev, headers), 0);
});
