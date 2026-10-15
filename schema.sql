-- ida 2030 demo schema (simulated data only)
CREATE TABLE IF NOT EXISTS citizens (
  id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, birth_date TEXT,
  nationality TEXT, residence_status TEXT, street TEXT, postal_code TEXT, city TEXT,
  passport_number TEXT, passport_expiry TEXT, prefers TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, citizen_id TEXT, lang TEXT, messages TEXT, pending TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY, session_id TEXT, service TEXT, data TEXT, missing TEXT,
  status TEXT DEFAULT 'draft', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, draft_id TEXT, citizen_id TEXT, service TEXT, data TEXT,
  status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY, session_id TEXT, citizen_id TEXT, reason TEXT, summary TEXT,
  contact TEXT, status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, case_ref TEXT, citizen_id TEXT, target TEXT, status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, citizen_id TEXT, office_id TEXT, slot TEXT, data TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS letters (
  id TEXT PRIMARY KEY, sender TEXT, subject TEXT, delivery TEXT,
  notified_offset_days INTEGER, deadline_days INTEGER, amount_eur REAL, body TEXT
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, type TEXT, payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO citizens VALUES
 ('anna','Anna','Huber','1948-03-12','AT','citizen','Gumpendorfer Straße 10/5','1060','Wien','P1234567','2026-12-05','voice,simple'),
 ('ali','Ali','Rahimi','1992-07-01','AF','Rot-Weiß-Rot-Karte plus','Annenstraße 3/2','8020','Graz',NULL,NULL,'english'),
 ('max','Max','Berger','2004-05-20','AT','citizen','Lerchenfelder Straße 40/12','1070','Wien','P7654321','2031-02-01','text');

-- Demo letters. Dates are relative to "today" so the demo never gets stale. {{deadline}} is filled at runtime.
INSERT OR REPLACE INTO letters VALUES
 ('L1','Magistrat der Stadt Wien (Demo)','Anonymverfügung – Parkometerabgabe','standard',-3,28,36.0,
  'ANONYMVERFÜGUNG (DEMO)\n\nAm Kraftfahrzeug W-12345X wurde festgestellt, dass die Parkometerabgabe nicht entrichtet wurde. Gemäß § 49 VStG wird ein Betrag von EUR 36,00 vorgeschrieben.\n\nWird der Betrag bis {{deadline}} mit dem beiliegenden Zahlschein (Identifikationsnummer 1234 5678 9012) eingezahlt, ist die Angelegenheit erledigt. Andernfalls wird ein Verwaltungsstrafverfahren gegen den Lenker eingeleitet.\n\nEin Rechtsmittel gegen diese Anonymverfügung ist nicht zulässig.'),
 ('L2','Finanzamt Österreich (Demo)','Ergänzungsersuchen – Arbeitnehmerveranlagung 2025','RSb',-2,14,NULL,
  'ERGÄNZUNGSERSUCHEN (DEMO)\n\nIm Zuge der Bearbeitung Ihrer Erklärung zur Arbeitnehmerveranlagung 2025 werden Sie ersucht, bis {{deadline}} folgende Unterlagen nachzureichen:\n\n1. Belege über die geltend gemachten Krankheitskosten (EUR 1.240,00)\n2. Bestätigung über die Spendenzahlungen\n\nDie Unterlagen können über FinanzOnline (Databox) oder postalisch übermittelt werden. Werden die Unterlagen nicht fristgerecht vorgelegt, erfolgt die Veranlagung ohne Berücksichtigung der beantragten Beträge.'),
 ('L3','Österreichische Gesundheitskasse (Demo)','Information zur Mitversicherung','standard',-6,30,NULL,
  'INFORMATION (DEMO)\n\nFür die Weitergewährung der Mitversicherung Ihres Angehörigen benötigen wir bis {{deadline}} eine aktuelle Bestätigung über den gemeinsamen Haushalt (z.B. Meldebestätigung).\n\nSie können die Bestätigung online über die Website der ÖGK hochladen oder in einer Kundenservicestelle abgeben.');
