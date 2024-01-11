const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const fileUpload = require("express-fileupload");
const ejs = require("ejs");
const fs = require("fs");
const favicon = require("serve-favicon");
const path = require("path");
const app = express();
app.set("view engine", "ejs");
app.use(favicon(path.join(__dirname, "src", "imgs" ,"favicon.ico")));

mongoose.connect("mongodb://localhost/nodejs_games_app", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    balance: { type: Number, default: 1000 },
    nickname: String,
    profilePicture: String,
});

const User = mongoose.model("User", userSchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(
    session({ secret: "your-secret-key", resave: true, saveUninitialized: true }),
);
app.use("/public", express.static("public"));
app.use("/src", express.static("src"));
const multer = require("multer");

const storage = multer.diskStorage({
    destination: "./public/uploads/",
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});

const upload = multer({ dest: __dirname + "/public/uploads/" });

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        return next();
    } else {
        res.redirect("/login");
    }
};

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/edit", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);
    res.render(__dirname + "/edit.ejs", { user });
});

app.post(
    "/edit",
    isAuthenticated,
    upload.single("profilePicture"),
    async (req, res) => {
        console.log(req.body);
        try {
            const { password, nickname } = req.body;
            const user = await User.findById(req.session.userId);

            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                user.password = hashedPassword;
            }

            if (nickname) {
                user.nickname = nickname;
            }

            if (req.file) {
                const profilePicture = req.file;
                const uploadPath =
                    __dirname + "/public/uploads/" + profilePicture.originalname;

                fs.rename(profilePicture.path, uploadPath, function (err) {
                    if (err) {
                        return res.status(500).send(err);
                    }

                    user.profilePicture =
                        "/public/uploads/" + profilePicture.originalname;

                    user.save();
                });
            }

            res.redirect("/dashboard");
        } catch (error) {
            console.error("Error updating user information:", error);
            res.status(500).send("Internal Server Error");
        }
    },
);
app.get("/register", (req, res) => {
    res.sendFile(__dirname + "/register.html");
});
app.post("/register", upload.single("profilePicture"), async (req, res) => {
    try {
        console.log("Received registration request:", req.body);
        console.log("Received file:", req.file);

        const { username, password, nickname } = req.body;

        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.send(
                'Username already exists. <a href="/register">Try again</a>',
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword,
            nickname,

            profilePicture: req.file ? "/uploads/" + req.originalname : "",
        });

        await newUser.save();
        if (req.file) {
            const profilePicture = req.file;
            const uploadPath =
                __dirname + "/public/uploads/" + profilePicture.originalname;

            fs.rename(profilePicture.path, uploadPath, function (err) {
                if (err) {
                    return res.status(500).send(err);
                }

                newUser.profilePicture =
                    "/public/uploads/" + profilePicture.originalname;

                newUser.save();
            });
        }
        res.redirect("/login");
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
        }
        res.redirect("/login");
    });
});

app.get("/login", (req, res) => {
    res.sendFile(__dirname + "/login.html");
});
app.get("/slots", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);

    res.render(__dirname + "/slots.ejs", { user });
});

app.post("/slots", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);

    const betAmount = parseInt(req.body.betAmount);

    if (isNaN(betAmount) || betAmount <= 0 || betAmount > user.balance) {
        return res.send('Invalid bet amount. <a href="/slots">Try again</a>');
    }

    const symbols = {
        cherry: "🍒",
        lemon: "🍋",
        orange: "🍊",
        plum: "🍇",
        bell: "🔔",
        bar: "BAR",
        seven: "7️⃣",
    };
    const symbolArray = Object.values(symbols);
    const result = [];
    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * symbolArray.length);
        result.push(symbolArray[randomIndex]);
    }
    let multiplier = 0;
    if (result[0] === result[1] || result[1] === result[2]) {
        multiplier = 2;
    }
    if (result[0] === result[1] && result[1] === result[2]) {
        multiplier = 3;
    }

    const resultAmount = betAmount * (multiplier - 1);

    user.balance += resultAmount;

    await user.save();

    res.render(__dirname + "/slots-result.ejs", {
        user,
        betAmount,
        result,
        multiplier,
        resultAmount,
    });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });

    if (user) {
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            req.session.userId = user._id;
            return res.redirect("/dashboard");
        }
    }

    res.send(
        'User not found or incorrect password. <a href="/login">Try again</a>',
    );
});

app.get("/dashboard", async (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const user = await User.findById(req.session.userId);

    res.render(__dirname + "/dashboard.ejs", { user });
});
app.get("/dice", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);

    res.render(__dirname + "/dice.ejs", { user });
});

app.post("/dice", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);

    const betAmount = parseInt(req.body.betAmount);

    if (isNaN(betAmount) || betAmount <= 0 || betAmount > user.balance) {
        return res.send('Invalid bet amount. <a href="/dice">Try again</a>');
    }

    const diceResult = Math.floor(Math.random() * 6) + 1;

    let multiplier = 0; // Default multiplier is 0 (user loses)
    if (diceResult === 6) {
        multiplier = 100;
    }

    const resultAmount = betAmount * (multiplier - 1);

    user.balance += resultAmount;

    await user.save();

    res.render(__dirname + "/dice-result.ejs", {
        user,
        betAmount,
        diceResult,
        multiplier,
        resultAmount,
    });
});

app.post("/dashboard", async (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const user = await User.findById(req.session.userId);

    user.nickname = req.body.nickname;
    user.profilePicture = req.body.profilePicture;

    if (req.files && req.files.profilePicture) {
        const profilePicture = req.files.profilePicture;
        const uploadPath = __dirname + "/public/uploads/" + profilePicture.name;

        profilePicture.mv(uploadPath, function (err) {
            if (err) {
                return res.status(500).send(err);
            }
        });

        user.profilePicture = "/public/uploads/" + profilePicture.name;
    }

    await user.save();

    res.redirect("/dashboard");
});

app.get("/add-balance", async (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }

    const user = await User.findById(req.session.userId);

    user.balance += 100;
    await user.save();

    res.redirect("/dashboard");
});
app.get("/crash", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);

    res.render(__dirname + "/crash.ejs", { user });
});
app.post("/crash", isAuthenticated, async (req, res) => {
    const user = await User.findById(req.session.userId);

    const betAmount = parseInt(req.body.betAmount);

    if (isNaN(betAmount) || betAmount <= 0 || betAmount > user.balance) {
        return res.send('Invalid bet amount. <a href="/crash">Try again</a>');
    }

    const crashMultiplier = Math.random() * 3;

    const result = Math.floor(betAmount * (crashMultiplier - 1));

    user.balance += result;

    await user.save();

    res.render(__dirname + "/crash-result.ejs", {
        user,
        betAmount,
        crashMultiplier,
        result,
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
