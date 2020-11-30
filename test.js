const { execSync } = require('child_process');
const Axios = require('axios');
const Path = require('path');

async function jwtTest(auth) {
    
    let res = await Axios.get('http://34.67.166.60/api/auth/validate', {
        headers: {
            authorization: `Bearer ${auth}`
        }
    });

    console.log();

    return false;

}

async function test() {

    let resBlob = await Axios.get(`https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAFVxQBwyxRzcACB5jxg%3D%3D&hash=CBBAB1C6F03D5AE01E26E3B90CAECA&cid=N7srIT6M6gUMqKEpD~qwl12NVOaQxlqnypsNZ7EnGUtUWCkF9VGl9j8ZvKbXfY-miAgiJRwCeAEScX2SxQPkp7Gjx-Pnk~l-3Sioff7jYb&t=fe&referer=https%3A%2F%2Fwww.topps.com%2F&s=11422`);
    resBlob = resBlob.data;

    let challengeTag = `challenge: '`;
    let endTag = `'`;

    let challengeIndex = resBlob.indexOf(challengeTag);
    let challenge = resBlob.substr(challengeIndex + challengeTag.length);
    let tagIndex = challenge.indexOf(endTag);

    challenge = challenge.substr(0, tagIndex);

    // --proxy=osamaaa:osamaaa@us.smartproxy.com:10000 
    let command = `node index.js --headless=0 --challenge=${challenge} --gt=1e505deed3832c02c96ca5abe70df9ab --server=api-na.geetest.com --url=https://geo.captcha-delivery.com --auth=whatever`;

    console.log("Running", command);

    let res = execSync(command);
    console.log(res.toString());

}  

// jwtTest('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImp0aSI6IjI4MjdiOTJjLWQ5MGYtNGIwYi1hZjY0LTI0NzE0ODBkZTY4MCIsImlhdCI6MTYwNjcyNzYxMSwiZXhwIjoxNjA2NzMxMzAzfQ.OGUf_lZFU2cyRdtco_nz4CrRE1eSa1DwYacT3SGFpMA');
test();