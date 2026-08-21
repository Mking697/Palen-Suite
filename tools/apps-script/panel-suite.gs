/**
 * Panel Suite — the estimator's own Drive + Sheet endpoint.
 *
 * THIS FILE IS THE ONE COPY. `SETUP.md` tells you to open it and paste it into
 * Apps Script; it does not repeat it, because two copies of a script drift and
 * the one that runs is the one nobody edited.
 *
 * ---------------------------------------------------------------------------
 * Why a script at all, when the folder and the sheet already have URLs
 *
 * A URL alone cannot write to Google. A public folder can be READ by anyone
 * with the link and written to by nobody — putting a file in it needs an
 * authenticated call. This script is that call. It is deployed from the
 * estimator's own Google account and runs AS them, which is why the Panel Suite
 * repository holds no Google credential of any kind and never will.
 *
 * ---------------------------------------------------------------------------
 * What it is sent, by POST, from server/serve.ts
 *
 *   {
 *     jobNo:    "HI-15191",
 *     savedAt:  "2026-08-18T09:30:00.000Z",
 *     folderId: "1AbCdEf…",          // from the estimator's profile
 *     files:    [{ name, mimeType, base64 }, …],
 *     boq:      { header: [...], rows: [[...], …] },
 *     flashing: { header: [...], rows: [[...], …] }
 *   }
 *
 * `folderId` arrives with the request rather than living in this file, so that
 * changing which folder a job is filed into is editing one box in the app —
 * not editing and redeploying this script. FOLDER_ID below is only the fallback
 * for a request that names no folder.
 *
 * Deploy:  Deploy → New deployment → type Web app
 *          Execute as: Me           (this is what grants the write)
 *          Who has access: Anyone   (so the server can reach it)
 *
 * The `…/exec` URL it gives back goes in Panel Suite under My settings.
 * TREAT THAT URL AS A SECRET — anyone holding it can run this script.
 */

/** Used only when a request does not name a folder. Optional. */
var FOLDER_ID = '';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var out = { ok: true, jobNo: body.jobNo || '', files: [], rows: 0 };

    var folderId = body.folderId || FOLDER_ID;
    if (body.files && body.files.length) {
      if (!folderId) throw new Error('No Drive folder set — fill it in under My settings.');
      out.files = writeFiles(folderId, body.jobNo, body.files);
    }

    /*
     * Every row carries the timestamp and the job number in its first two
     * columns. That is what makes a sheet of thousands of rows searchable back
     * to one job — a BOQ line on its own says nothing about which job it came
     * from, and the row is the only place that can be recorded.
     */
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stamp = body.savedAt || new Date().toISOString();
    out.rows += appendBlock(ss, 'BOQ', body.boq, stamp, body.jobNo);
    out.rows += appendBlock(ss, 'Flashing', body.flashing, stamp, body.jobNo);

    return reply(out);
  } catch (err) {
    /*
     * A failure is reported, never swallowed. A push that silently did nothing
     * is the worst outcome here: the estimator would believe the drawing office
     * has the sheet, and nobody finds out until the factory cuts to nothing.
     */
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** A job's files, in a sub-folder named after the job number. */
function writeFiles(folderId, jobNo, files) {
  var parent = DriveApp.getFolderById(folderId);
  var name = String(jobNo || 'unnumbered').trim() || 'unnumbered';

  // one sub-folder per job, made once and reused
  var found = parent.getFoldersByName(name);
  var folder = found.hasNext() ? found.next() : parent.createFolder(name);

  var urls = [];
  files.forEach(function (f) {
    var blob = Utilities.newBlob(Utilities.base64Decode(f.base64), f.mimeType, f.name);
    // the same job pushed twice replaces its files rather than piling up
    // "BOQ (1).xlsx" beside them — one job, one current drawing, one current BOQ
    var old = folder.getFilesByName(f.name);
    while (old.hasNext()) old.next().setTrashed(true);
    urls.push(folder.createFile(blob).getUrl());
  });
  return urls;
}

/**
 * Append one block to its own tab, timestamp and job number first.
 *
 * The rows are appended exactly as they were sent. This script computes
 * nothing — the same rule the drawings follow. A total worked out here would be
 * a second opinion about a BOQ that has already been checked.
 */
function appendBlock(ss, name, block, stamp, jobNo) {
  if (!block || !block.rows || !block.rows.length) return 0;
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0 && block.header) {
    sheet.appendRow(['Timestamp', 'Job No'].concat(block.header));
  }
  block.rows.forEach(function (row) {
    sheet.appendRow([stamp, jobNo].concat(row));
  });
  return block.rows.length;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
