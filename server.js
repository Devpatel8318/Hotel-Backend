const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User')
const Place = require('./models/Place');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken')
const cookieParser = require("cookie-parser");
const imageDownloader = require('image-downloader');
const multer = require('multer');
const fs = require('fs');
const Booking = require('./models/Booking');
require('dotenv').config();
const bodyParser = require('body-parser');
const os = require('os');
const path = require('path');
const url = require('url');

const bcryptSalt = bcrypt.genSaltSync(10);
const jwtSecret = process.env.JWT_SECRET ;


app.use(bodyParser.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(cors({
    origin: true,
    credentials: true
}));
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use(bodyParser.text({ type: 'text/*' }));
app.use(express.static(__dirname));



//Mongodb Connection
async function connectDB() {
    try {
        await mongoose.connect(`${process.env.MONGO_URL}?retryWrites=true&w=majority`, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Connected to MongoDB");
    } catch (err) {
        console.log("Error in Connecting", err);
    }
}
connectDB();




app.post('/api/register', async (req, res) => {
    try {
        connectDB();

        const { name, email, password } = req.body;
        const userDoc = await User.create({
            name,
            email,
            password: bcrypt.hashSync(password, bcryptSalt),
        });
        res.json(userDoc);
    }
    catch (e) {
        res.status(422).send(e);
    }
})

app.post('/api/login', async (req, res) => {
    try {
        connectDB();

        const { email, password } = req.body;
        const userDoc = await User.findOne({ email });
        if (userDoc) {
            const passOK = bcrypt.compareSync(password, userDoc.password)
            if (passOK) {
                const token = jwt.sign({ email: userDoc.email, id: userDoc._id }, jwtSecret, {
                });
                res.cookie('token', token, { httpOnly: false, secure: true, sameSite: "none", domain: "localhost", expires: new Date(Date.now() + 5 * 60 * 60 * 1000) }).json({ status: "ok", data: token, userDoc });
            } else {
                res.status(422).json("Wrong Password")
            }
        }
        else {
            res.status(422).json("Not Found");
        }
    }
    catch (e) {
        res.status(500).send({ error: e.message });
    }
});

app.get('/api/profile', (req, res) => {
    try {

        connectDB();

        const { token } = req.cookies;
        if (token) {
            jwt.verify(token, jwtSecret, {}, async (err, user) => {
                if (err) throw err;
                const { name, email, _id } = await User.findById(user.id);

                res.json({ name, email, _id });
            });
        } else {
            res.json("null");
        }
    }
    catch (e) {
        res.status(500).send({ error: e.message });
    }

})


app.post('/api/logout', (req, res) => {
    try {
        res.cookie('token', "", { httpOnly: false, secure: true, sameSite: "none", domain: "localhost", expires: new Date(Date.now() + 15 * 60 * 1000) }).json("deleted");
    }
    catch (e) {
        res.send({ err: e.message }).status(500);
    }

})

async function downloadImage(imageUrl) {
    try {
 
        const options = {
            url: imageUrl,
            dest: '/tmp' // set a temporary destination to store the downloaded image file
        }
        const { filename } = await imageDownloader.image(options);
        const imageBuffer = fs.readFileSync(filename);
        fs.unlinkSync(filename); // remove the temporary file
        return imageBuffer;
    } catch (error) {
        console.error(error);
        throw new Error('Failed to download image');
    }
}

app.post('/api/uploadByLink', async (req, res) => {
    const { link: imageUrl } = req.body;
    try {
        const parsedUrl = url.parse(imageUrl);
        const newUrl = parsedUrl.href.replace(parsedUrl.search, '');
        const imageBuffer = await downloadImage(newUrl);
        let base64;
        if (newUrl.endsWith('.jpeg') || newUrl.endsWith('.jpg')) {
            base64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        } else if (newUrl.endsWith('.png')) {
            base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
        } else {
            throw new Error('Unsupported file type');
        }
        res.status(200).json({ base64 });
    } catch (error) {
        console.error(error);
        if (error.message === 'Unsupported file type') {
            res.status(400).json({ error: 'Unsupported file type. Only JPEG, JPG, and PNG formats are supported.' });
        } else if (error.message === 'Failed to download image') {
            res.status(400).json({ error: 'Failed to download image. Please check the URL and try again.' });
        } else {
            res.status(500).json({ error: 'An unexpected error occurred.' });
        }
    }
});




app.post('/api/places', (req, res) => {
    const { token } = req.cookies;
    try {

        connectDB();
        if (token) {
            connectDB();

            const { title, address, addedPhotos,
                perks, description, extraInfo,
                checkIn, checkOut, maxGuests, price, } = req.body;
            jwt.verify(token, jwtSecret, {}, async (err, user) => {
                if (err) throw err;
                const placeDoc = await Place.create({
                    owner: user.id,
                    title,
                    address,
                    descriptions: description,
                    extraInfo,
                    perks,
                    checkIn,
                    checkOut,
                    maxGuests,
                    photos: addedPhotos, price,
                })
                res.json(placeDoc).status(200);
            });
        } else {
            res.json("Error").status(501);
        }
    } catch (e) {
        res.send({ err: e.message }).status(500);
    }

})

app.get('/api/userplaces', (req, res) => {
    try {
        connectDB();
        const { token } = req.cookies;
        if (token) {
            jwt.verify(token, jwtSecret, {}, async (err, user) => {
                if (err) throw err;
                const { id } = user;
                res.json(await Place.find({ owner: id }));
            });
        } else {
            res.json("null");
        }
    } catch (e) {
        res.send({ err: e.message }).status(500);
    }
})

app.get('/api/places/:id', async (req, res) => {
    try {
        connectDB();
        const { id } = req.params;
        res.json(await Place.findById(id));
    }
    catch (e) {
        res.send({ err: e.message }).status(500);
    }
});


app.put('/api/places', async (req, res) => {
    try {
        connectDB();
        const { token } = req.cookies;
        const { id, title, address, addedPhotos,
            perks, description, extraInfo,
            checkIn, checkOut, maxGuests, price } = req.body;

        if (token) {
            jwt.verify(token, jwtSecret, {}, async (err, user) => {
                if (err) throw err;
                const placeDoc = await Place.findById(id);
                if (user.id == placeDoc.owner.toString()) {
                    placeDoc.set({
                        title,
                        address,
                        descriptions: description,
                        extraInfo,
                        perks,
                        checkIn,
                        checkOut,
                        maxGuests,
                        photos: addedPhotos,
                        price,
                    })
                    await placeDoc.save();
                    res.json('ok');
                }

            });
        } else {
            res.json("null");
        }
    } catch (e) {
        res.send({ err: e.message }).status(500);
    }

});



//index page
app.get('/api/places', async (req, res) => {
    try {
        connectDB();
        res.json(await Place.find());
    } catch (e) {
        res.send({ err: e.message }).status(500);
    }

})





app.post('/api/bookings', (req, res) => {

    try {
        const { token } = req.cookies;
        // console.log(token);
        if (token) {
            jwt.verify(token, jwtSecret, {}, async (err, userData) => {
                if (err) throw err;
                const {
                    place, checkIn, checkOut, numberOfGuests, name, phone, price
                } = req.body;
                Booking.create({
                    place, checkIn, checkOut, numberOfGuests, name, phone, price,
                    user: userData.id,
                }).then((doc) => {
                    res.json(doc);
                }).catch((err) => {
                    throw err;
                });
            });
        } else {
            res.json("null");
        }
    } catch (e) {
        res.send({ err: e.message }).status(500);
    }






});

app.get('/api/bookings', async (req, res) => {

    try {
        const { token } = req.cookies;
        // console.log(token);
        if (token) {
            jwt.verify(token, jwtSecret, {}, async (err, userData) => {
                if (err) throw err;
                res.json(await Booking.find({ user: userData.id }).populate('place'))
            });
        } else {
            res.json("null");
        }
    } catch (e) {
        res.send({ err: e.message }).status(500);
    }

})


const Image = require("./models/Images");
app.post('/api/devupload', async (req, res) => {
    // const imageData = req.body.myFile;
    const imageDatas = req.body.myFile;
    // console.log(imageDatas);

    if (!imageDatas || imageDatas.length === 0) {
        return res.status(400).json({ message: 'Images are required' });
    }

    try {
        const newImage = await Image.create({ myFile: imageDatas });
        await newImage.save();
        res.status(201).json({ message: 'Images uploaded successfully', images: newImage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Something went wrong' });
    }

});

app.get('/api/dev', async (req, res) => {
res.json({ message: "OK"});
})



app.listen(4000);