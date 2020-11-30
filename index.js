const puppeteer = require('playwright')
const fs = require('fs');
const Jimp = require('jimp')
const ProxyChain = require('proxy-chain');
const pixelmatch = require('pixelmatch')
const Path = require('path');
const { cv } = require('opencv-wasm');
const { default: Axios } = require('axios');
var argv = require('minimist')(process.argv.slice(2));

const TEMPLATE = fs.readFileSync('./template.html').toString();

console.log = () => {};

process.on('unhandledRejection', error => {
    // Won't execute
    console.log('unhandledRejection', error.test);
});


async function processProxy(proxy) {
    
    // username:password@ip:port

    let tempProxy = proxy.toLowerCase();
    let proxyConfiguration = "";
    if (tempProxy.indexOf("http://") > -1 || tempProxy.indexOf('https://') > -1) {
        if (tempProxy.indexOf("http://") > -1) {
            proxy = proxy.replace(proxy.substr(0, "http://".length), "");
            proxyConfiguration = "http://";
        } 
        if (tempProxy.indexOf("https://") > -1) {
            proxy = proxy.replace(proxy.substr(0, "https://".length), "");
            proxyConfiguration = "https://"
        } 
    }else {
        console.log("Not found", tempProxy);
        proxyConfiguration = "http://"
    }

    let username, password, ip, port;

    if (proxy.indexOf("@") > -1) {
        let [auth, con] = proxy.split("@");
        let [usr, pswd] = auth.split(':');
        let [rmt, prt] = con.split(':');
        username = usr;
        password = pswd;
        ip = rmt;
        port = prt;
    }else {
        let [rmt, prt] = proxy.split(':');
        ip = rmt;
        port = prt;
    }
    

    let proxyUrl;

    if (username.length && password.length) {
        proxyUrl = `${proxyConfiguration}${username}:${password}@${ip}:${port}`;
    }else {
        proxyUrl = `${proxyConfiguration}${ip}:${port}`;
    }

    console.log({username, password, ip, port});
    console.log(proxyUrl);

    return proxyUrl;

}

async function findPuzzlePosition (page) {
    try {
        let images = await page.$$eval('.geetest_canvas_img canvas', canvases => canvases.map(canvas => canvas.toDataURL().replace(/^data:image\/png;base64,/, '')))

        // await fs.writeFile(`./puzzle.png`, images[1], 'base64')
        let puzzleImage = Buffer.from(images[1], 'base64');
    
        // let srcPuzzleImage = await Jimp.read('./puzzle.png')
        let srcPuzzleImage = await Jimp.read(puzzleImage)
        let srcPuzzle = cv.matFromImageData(srcPuzzleImage.bitmap)
        let dstPuzzle = new cv.Mat()
    
        cv.cvtColor(srcPuzzle, srcPuzzle, cv.COLOR_BGR2GRAY)
        cv.threshold(srcPuzzle, dstPuzzle, 127, 255, cv.THRESH_BINARY)
    
        let kernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
        let anchor = new cv.Point(-1, -1)
        cv.dilate(dstPuzzle, dstPuzzle, kernel, anchor, 1)
        cv.erode(dstPuzzle, dstPuzzle, kernel, anchor, 1)
    
        let contours = new cv.MatVector()
        let hierarchy = new cv.Mat()
        cv.findContours(dstPuzzle, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    
        let contour = contours.get(0)
        let moment = cv.moments(contour)
    
        return [Math.floor(moment.m10 / moment.m00), Math.floor(moment.m01 / moment.m00)]
    }catch(err) {
        process.exit(1);
    }
   
}

async function findDiffPosition (page, d_diffImage) {
    try {
        await page.waitFor(100)

        // let srcImage = await Jimp.read('./diff.png')
        let srcImage = await Jimp.read(d_diffImage)
        let src = cv.matFromImageData(srcImage.bitmap)
    
        let dst = new cv.Mat()
        let kernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
        let anchor = new cv.Point(-1, -1)
    
        cv.threshold(src, dst, 127, 255, cv.THRESH_BINARY)
        cv.erode(dst, dst, kernel, anchor, 1)
        cv.dilate(dst, dst, kernel, anchor, 1)
        cv.erode(dst, dst, kernel, anchor, 1)
        cv.dilate(dst, dst, kernel, anchor, 1)
    
        cv.cvtColor(dst, dst, cv.COLOR_BGR2GRAY)
        cv.threshold(dst, dst, 150, 255, cv.THRESH_BINARY_INV)
    
        let contours = new cv.MatVector()
        let hierarchy = new cv.Mat()
        cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    
        let contour = contours.get(0)
        let moment = cv.moments(contour)
    
        return [Math.floor(moment.m10 / moment.m00), Math.floor(moment.m01 / moment.m00)]
    }catch(err) {
        process.exit(1);
    }
}

async function saveSliderCaptchaImages(page) {
    try {
        await page.waitForSelector('.geetest_btn')
        //await page.waitFor(1000)
    
        await page.click('.geetest_btn')
    
        await page.waitForSelector('.geetest_canvas_img canvas', { visible: true })
        //await page.waitFor(1000)
        let images = await page.$$eval('.geetest_canvas_img canvas', canvases => {
            return canvases.map(canvas => canvas.toDataURL().replace(/^data:image\/png;base64,/, ''))
        })
    
        // await fs.writeFile(`./captcha.png`, images[0], 'base64')
        // await fs.writeFile(`./original.png`, images[2], 'base64')
    
        return {
            captcha: Buffer.from(images[0], 'base64'),
            original: Buffer.from(images[2], 'base64')
        };
    }catch(err){
        process.exit(1);
    }
}

async function saveDiffImage(d_images) {
    try {
        // const originalImage = await Jimp.read('./original.png')
        // const captchaImage = await Jimp.read('./captcha.png')
        const originalImage = await Jimp.read(d_images.original)
        const captchaImage = await Jimp.read(d_images.captcha)

        const { width, height } = originalImage.bitmap
        const diffImage = new Jimp(width, height)

        const diffOptions = { includeAA: true, threshold: 0.2 }

        pixelmatch(originalImage.bitmap.data, captchaImage.bitmap.data, diffImage.bitmap.data, width, height, diffOptions)
        return diffImage;
    }catch(err) {
        process.exit(1);
    }
}

async function checkValid(auth) {

    let success = false;

    try {
        let res = await Axios.get('http://34.67.166.60/api/auth/validate', {
            headers: {
                authorization: `Bearer ${auth}`
            }
        });
        success = true;
    }catch(err) {}

    return success;

}

async function Solve (ip, gt, challenge, url, apiServer, headless = true, auth) {

    try {

         // let isValid = await checkValid(auth);
        // if (!isValid) process.exit(0);

        let proxy;
        if(ip) {
            let processedProxy = await processProxy(ip);
            proxy = await ProxyChain.anonymizeProxy(processedProxy);
        }

        let args = {
            headless: !!headless,
            defaultViewport: { width: 1366, height: 768 },
        };

        if (proxy) {
            args.proxy = {
                server: proxy
            };
        }

        let browserPath = Path.resolve(__dirname, "./Browser/Playwright.exe");

        const browser = await puppeteer.webkit.launch({
            executablePath: browserPath,
            ...args
        })

        const page = await browser.newPage()

        page.waitFor = ms => new Promise(r => setTimeout(r, ms));

        let template = TEMPLATE;
        template = template.replace('{{gt}}', gt);
        template = template.replace('{{challenge}}', challenge);
        template = template.replace('{{api_server}}', apiServer);

        await page.route("**", route => {
        
            let urla = route.request().url();
            let method = route.request().method();

            if (urla.indexOf(url) != -1 && method == "GET") {
                return route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    headers: {},
                    body: template,
                });
            }

            return route.continue();

        });

        Promise.resolve(
            new Promise(async (resolve, reject) => {
                
                await page.goto(url);

                await page.waitFor(1000)

                let d_images = await saveSliderCaptchaImages(page)
                let d_diffImage = await saveDiffImage(d_images)

                let [cx, cy] = await findDiffPosition(page, d_diffImage)

                const sliderHandle = await page.$('.geetest_slider_button')
                const handle = await sliderHandle.boundingBox()

                let xPosition = handle.x + handle.width / 2
                let yPosition = handle.y + handle.height / 2
                await page.mouse.move(xPosition, yPosition)
                await page.mouse.down()

                xPosition = handle.x + cx - handle.width / 2
                yPosition = handle.y + handle.height / 3
                await page.mouse.move(xPosition, yPosition, { steps: 5 })

                await page.waitFor(100)

                console.log("Finding puzzle position");
                let [cxPuzzle, cyPuzzle] = await findPuzzlePosition(page)

                console.log("Moving there");

                xPosition = xPosition + cx - cxPuzzle
                yPosition = handle.y + handle.height / 2
                await page.mouse.move(xPosition, yPosition, { steps: 15 })
                console.log("Releasing mouse (1 second)");
                await new Promise(r => setTimeout(r, 1000));
                await page.mouse.up()

            })
        )

        let result = await Promise.race([
            new Promise(async (resolve, reject) => {
                await page.waitForSelector('#results', { visible: true, timeout: 100000 });
                let result = await page.evaluate(_ => {
                    let r = window.document.getElementById('results');
                    let val = r.value;
                    return val;
                });

                result = JSON.parse(result);
                return resolve(result);
            }),
            new Promise(async (resolve, reject) => {
                await page.waitForSelector('#errorss', { visible: true });
                return reject(new Error("Failed to load"));
            })
        ])

        return result;

    }catch(err) {
        console.log(err);
        process.exit(1);
    }
   
}

if(!argv.gt || !argv.challenge || !argv.url || !argv.auth || !argv.server) {
    throw new Error('Bad arguments');
}

let usedProxy = argv.proxy || null;
let headless = argv.headless;

console.log(argv);

Solve(usedProxy, argv.gt, argv.challenge, argv.url, argv.server, headless, argv.auth)
    .then(result => console.info(JSON.stringify(result)))
    .then(() => process.exit())
    .catch(e => {
        console.log(JSON.stringify({
            error: e.message
        }))
        process.exit();
    });