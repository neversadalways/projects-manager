# 📋 ניהול פרויקטים

אפליקציית ווב פשוטה לניהול פרויקטים, מותאמת לטלפון ולמחשב. רצה בחינם על GitHub Pages, בלי שרת.

**לכל פרויקט:** שם, סטטוס, עדיפות, מי ביקש, אחראי, תאריך התחלה ויעד, אפיון, תגיות, קישורים, אחוז התקדמות (ידני או אוטומטי לפי משימות), רשימת משימות ויומן עדכונים (שינויי סטטוס נרשמים אוטומטית).

**עוד:** חיפוש, סינון לפי סטטוס/מבקש, מיון, כרטיסי סיכום (פעילים, באיחור, הושלמו), ייצוא ל-JSON ול-CSV (אקסל), וייבוא.

---

## שלב 1 – העלאת האפליקציה ל-GitHub Pages

1. ב-GitHub, צור ריפוזיטורי חדש, לדוגמה `projects-manager` (**Public**, כדי ש-Pages יעבוד בחשבון חינמי. רק קוד האפליקציה נמצא כאן, לא הנתונים שלך).
2. העלה את הקבצים מהתיקייה הזו (`index.html`, `app.js`, `style.css`, `manifest.webmanifest`, `icon.svg`):
   - דרך האתר: **Add file → Upload files**, או
   - דרך git:
     ```
     git remote add origin https://github.com/<USER>/projects-manager.git
     git push -u origin main
     ```
3. **Settings → Pages → Source: Deploy from a branch → `main` / `root` → Save**.
4. אחרי כדקה האפליקציה זמינה בכתובת: `https://<USER>.github.io/projects-manager/`

בטלפון: פתח את הכתובת, ואז **"הוסף למסך הבית"**, והיא תיפתח כמו אפליקציה.

## שלב 2 – סנכרון בין טלפון למחשב (מומלץ)

בלי סנכרון הנתונים נשמרים רק בדפדפן שבו הזנת אותם. כדי לראות את אותם הנתונים בכל מכשיר:

1. צור ריפוזיטורי **פרטי (Private)** נוסף, לדוגמה `my-projects-data`. סמן "Add a README" כדי שהריפוזיטורי לא יהיה ריק.
2. צור טוקן: **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories** → `my-projects-data`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Expiration: לבחירתך (כשהטוקן יפוג צריך ליצור חדש)
3. באפליקציה לחץ על ⚙️ ומלא: הטוקן, שם המשתמש, שם הריפוזיטורי `my-projects-data`. לחץ **"בדוק חיבור וטען"**.
4. חזור על שלב 3 בכל מכשיר.

הנתונים יישמרו בקובץ `projects.json` בריפוזיטורי הפרטי, וכל שינוי נשמר כ-commit, כך שיש היסטוריה מלאה.

> ⚠️ הטוקן נשמר רק בדפדפן של המכשיר שלך. אל תשתף אותו, ותן לו גישה רק לריפוזיטורי הנתונים.
> בחיבור הראשון במכשיר שכבר מחובר לקובץ קיים, הנתונים מ-GitHub מחליפים את הנתונים המקומיים. אם הזנת נתונים לפני החיבור, ייצא אותם קודם ל-JSON.

## הרצה מקומית

פתח את `index.html` בדפדפן, או הרץ `python -m http.server` בתיקייה והיכנס ל-`http://localhost:8000`.
