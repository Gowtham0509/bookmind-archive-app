import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import imageSize from "image-size";

const app = express();
const port = 3000;
const API_URL = "https://covers.openlibrary.org/b/isbn/";


const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "book_notes",
    password: "gowtham02",
    port: 5432,
});

db.connect();

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

async function fetchImageDimensions(url) {
    // const img = new Image();
    // return new Promise((res, rej) => {
    //     img.onload = () => res({width:img.width, height: img.height });
    //     img.onerror = e => rej(e);
    //     img.src = url;
    // });
    try {
        const dimensions = imageSize(url);
        return dimensions;
    }catch(err){
        console.log("Error getting image dimension", err);
        return {width:0, height:0};
    }
}

async function getCoverInfo(isbn) {
    const API_URL = "https://covers.openlibrary.org/b/isbn/";
    const coverUrl = await axios.get(`${API_URL}${isbn}-L.jpg`);
    console.log(`${API_URL}${isbn}-L.jpg`);

    const dimensions = await fetchImageDimensions(coverUrl)
    const coverInfo = {
        url: coverUrl,
        width: dimensions.width,
        height: dimensions.height
    };
    return coverInfo;
}

app.get("/", async (req, res) => {
    try{
        // const coverInfo = await getCoverInfo('9787806574584');
        // console.log(coverInfo);
        const result = await db.query("SELECT book_id,title, author, cover_url, isbn, to_char(date_read, 'YYYY-MM-DD') as formatted_date, overview, rating, buy_link  FROM books ORDER BY date_read DESC");
        let items = result.rows;
        res.render("index.ejs",{
           listItems: items, 
        });
    }catch(err){
        console.log(err);
    }
});

app.post("/create", (req, res) =>{
    if(req.body.new_note === "+ Add"){
        res.render("new.ejs", { book: {}, notes: {} });
    }
    else{
        res.redirect("/");
    }
});

app.post("/add", async (req, res) =>{
    try{
        const title = req.body.title;
        const author = req.body.author;
        const isbn = req.body.isbn;
        const cover = API_URL+`${isbn}-L.jpg`;
        const dateRead = req.body.date_read;
        const overview = req.body.overview;
        const rating = req.body.rating;
        const buy_link = req.body.buylink;
        const sanitizedNote = req.body.notes.replace(/\n/g, '<br>');

        const bookId = req.body.book_id;

        if(bookId){
            await db.query("UPDATE books SET title = $1, author = $2, isbn = $3, cover_url = $4, date_read = $5, overview = $6, rating = $7, buy_link = $8 WHERE book_id = $9",
            [title, author, isbn, cover, dateRead, overview, rating, buy_link,bookId]);
            
            await db.query("UPDATE notes SET note = $1, write_date = $2 WHERE book_id = $3",
            [sanitizedNote, dateRead, bookId]);
            console.log("Form processed successfully");
            console.log("Before redirect");
            res.redirect(`/full_review?book_id=${bookId}`);
            console.log("After redirect");
        } else{
             const book = await db.query("INSERT INTO books (title, author, cover_url, isbn, date_read, overview, rating, buy_link) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [title, author, cover, isbn, dateRead, overview, rating, buy_link]);

            let result = await db.query("SELECT book_id FROM books WHERE title = $1", [title]);
            const bookId = result.rows[0].book_id; 

            const notetab = await db.query("INSERT INTO notes (book_id, note, write_date) VALUES ($1, $2, $3)",[bookId, sanitizedNote, dateRead]);
            res.redirect("/");
        }
        
    }catch(err){
     
        console.log(err);
        res.status(500).send("Internal Server Error");

    }
});

    app.get("/full_review", async (req, res) => {
        try {
            const bookId = req.query.book_id;
            const bookInfo = await db.query("SELECT book_id,title, author, cover_url, isbn, to_char(date_read, 'YYYY-MM-DD') as formatted_date, overview, rating, buy_link  FROM books WHERE book_id = $1",[bookId]);
            let item = bookInfo.rows;
            const result = await db.query("SELECT note_id, book_id, note, to_char(write_date, 'YYYY-MM-DD') as formatted_date FROM notes WHERE book_id = $1",
            [bookId]);
            let list = result.rows;
    
            console.log(bookInfo);
            res.render("notes.ejs",{
                book:item[0],
                notes: list,
                editNote: true,
            });        
        } catch (err) {
            console.error("Error in /full_review (GET):", err);
            res.status(500).send("Internal Server Error");
        }
    });
    
    app.post("/full_review", async (req, res) => {
        try {
            const bookId = req.body.book_id;
            const bookInfo = await db.query("SELECT book_id,title, author, cover_url, isbn, to_char(date_read, 'YYYY-MM-DD') as formatted_date, overview, rating, buy_link  FROM books WHERE book_id = $1",[bookId]);
            let item = bookInfo.rows;
            const result = await db.query("SELECT note_id, book_id, note, to_char(write_date, 'YYYY-MM-DD') as formatted_date FROM notes WHERE book_id = $1",
            [bookId]);
            let list = result.rows;
    
            console.log(bookInfo);
            res.render("notes.ejs",{
                book:item[0],
                notes: list,
                editNote: false,
            });
        } catch (err) {
            console.log(err);
            res.status(500).send("Internal Server Error");
        }
    });


app.post("/edit", async (req, res)=>{
    try{
        const bookId = req.body.book_id;
        const bookResult = await db.query("SELECT * FROM books WHERE book_id = $1", [bookId]);
        const book = bookResult.rows[0];

        const notesResult = await db.query("SELECT * FROM notes WHERE book_id = $1", [bookId]);
        const notes = notesResult.rows;

        res.render("new.ejs", {book, notes});

    }catch(err){
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/remove", async (req, res) => {
    const bookId = req.body.book_id;
    console.log(bookId);
    if (req.body.remove === "Remove") {
        try {
            await db.query("DELETE FROM notes WHERE book_id = $1", [bookId]);

            const result = await db.query("DELETE FROM books WHERE book_id = $1", [bookId]);
            res.redirect("/"); 

        } catch (err) {
            console.error(err);
            // Internal server error
            res.status(500).json({ success: false, message: "Internal server error." });
        }
    } else {
        // Bad request format
        res.status(400).json({ success: false, message: "Bad request format." });
    }

});



app.get("/about", (req, res)=>{
    res.render("about.ejs");
});

app.get("/contact", (req, res) => {
    res.render("contact.ejs");
});



app.listen(port, () => {
    console.log(`Server listening to port ${port}`);
});