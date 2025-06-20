// 최상단 환경변수 로딩
require('dotenv').config();

const express = require('express');
const app = express();
const port = 3000;
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mysql = require('mysql2/promise');

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
}));

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/page/index.html');
});

app.get('/main', (req, res) => {
    const cook = req.cookies.user;
    const sess = req.sessionID;
    if (cook === sess) {
        res.sendFile(__dirname + '/page/main.html');
    } else {
        res.send(`<script>alert('로그인하고 오세요'); location.href='/'</script>`);
    }
});

app.get('/sign_up', (req, res) => {
    res.sendFile(__dirname + '/page/sign_up.html');
});

app.post('/sign_up', async (req, res) => {
    const { id, pw } = req.body;
    const salt = 5;
    const hash = bcrypt.hashSync(pw, salt);

    try {
        const [rows] = await connection.query(`SELECT * FROM hyeok.id_table WHERE id = ?`, [id]);
        if (rows.length > 0) {
            return res.send(`<script>alert("중복된 아이디입니다"); location.href="/sign_up"</script>`);
        }

        await connection.query(`INSERT INTO hyeok.id_table(id,pw) VALUES(?, ?)`, [id, hash]);
        res.send(`<script>alert("회원가입 성공!"); location.href="/"</script>`);
    } catch (err) {
        console.error(err);
        res.status(500).send("DB 오류");
    }
});

app.post('/login', async (req, res) => {
    const { id, pw } = req.body;

    try {
        const [rows] = await connection.query(`SELECT pw FROM hyeok.id_table WHERE id = ?`, [id]);
        if (rows.length === 0) throw new Error("ID 없음");

        const db_pw = rows[0].pw;
        const check = bcrypt.compareSync(pw, db_pw);

        if (check) {
            req.session.user = id;
            res.cookie('user', req.sessionID);
            res.send(`<script>alert('로그인 성공!'); location.href='/main';</script>`);
        } else {
            res.send(`<script>alert('로그인 실패!'); location.href='/';</script>`);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("로그인 오류");
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('user');
        res.redirect('/');
    });
});

const authMiddleware = (req, res, next) => {
    const cook = req.cookies.user;
    const sess = req.sessionID;
    if (cook === sess) {
        next();
    } else {
        res.send(`<script>alert('로그인하고 오세요'); location.href='/'</script>`);
    }
};

app.get('/content', authMiddleware, (req, res) => {
    res.sendFile(__dirname + '/page/content.html');
});

app.post('/write', authMiddleware, async (req, res) => {
    const { title, content } = req.body;
    const writer = req.session.user;
    try {
        await connection.query(
            `INSERT INTO hyeok.content(title, writer, content) VALUES(?, ?, ?)`,
            [title, writer, content]
        );
        res.send(`<script>alert('등록 완료'); location.href='/main';</script>`);
    } catch (err) {
        console.error(err);
        res.status(500).send("DB 오류");
    }
});

app.get('/pyramid', authMiddleware, (req, res) => {
    res.sendFile(__dirname + '/page/pyramid.html');
});

app.get('/pyramid_f', authMiddleware, (req, res) => {
    res.sendFile(__dirname + '/page/pyramid_f.html');
});

app.post('/list', authMiddleware, async (req, res) => {
    const { num } = req.body;
    try {
        const [rows] = await connection.query(`SELECT * FROM hyeok.content WHERE idx = ?`, [num]);
        if (rows.length === 0) throw new Error("게시글 없음");

        const { title, writer, content } = rows[0];
        res.send(`
            <button onclick="back()">뒤로 가기</button><br>
            <script>
                function back() { location.href='/main'; }
                document.writeln("제목: ${title}<br>");
                document.writeln("작성자: ${writer}<br>");
                document.writeln("내용: ${content}");
            </script>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send("글 조회 오류");
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
