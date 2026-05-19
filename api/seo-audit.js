export default async function handler(req, res) {

res.setHeader("Access-Control-Allow-Origin","*");
res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS,GET");
res.setHeader("Access-Control-Allow-Headers","Content-Type");

if(req.method==="OPTIONS"){
return res.status(200).end();
}

if(req.method==="GET"){
return res.status(200).json({
status:"running"
});
}

try{

const {url}=req.body;

if(!url){

return res.status(400).json({
error:"URL required"
});

}

let targetUrl;

try{

targetUrl=new URL(
url.startsWith("http")
?url
:`https://${url}`
);

}catch{

return res.status(400).json({
error:"Invalid URL"
});

}

const startTime=Date.now();

const controller=new AbortController();

const timeout=setTimeout(()=>{

controller.abort();

},15000);

let response;

try{

response=await fetch(targetUrl.toString(),{

headers:{
"User-Agent":"BrandShuoBot"
},

redirect:"follow",
signal:controller.signal

});

}finally{

clearTimeout(timeout);

}

const responseTime=
Date.now()-startTime;

const html=
await response.text();


function getTag(regex){

const match=
html.match(regex);

return match
?match[1].trim()
:"";

}

function cleanText(text){

return text
.replace(/<[^>]+>/g,"")
.replace(/\s+/g," ")
.trim();

}

const title=getTag(
/<title[^>]*>([\s\S]*?)<\/title>/i
);

const metaDescription=
getTag(
/<meta[^>]+name=["']description["'][^>]+content=["']([^"]*)/i
);

const canonical=
getTag(
/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"]*)/i
);

const favicon=
getTag(
/<link[^>]+rel=["']icon["'][^>]+href=["']([^"]*)/i
);

const hreflangCount=
(
html.match(
/hreflang=/gi
)
||[]
).length;

const ogCount=
(
html.match(
/property=["']og:/gi
)
||[]
).length;

const twitterCount=
(
html.match(
/name=["']twitter:/gi
)
||[]
).length;

const schemaCount=
(
html.match(
/application\/ld\+json/gi
)
||[]
).length;

const h1s=
[
...html.matchAll(
/<h1[^>]*>([\s\S]*?)<\/h1>/gi
)
]
.map(x=>cleanText(x[1]));

const h2s=
[
...html.matchAll(
/<h2[^>]*>([\s\S]*?)<\/h2>/gi
)
]
.map(x=>cleanText(x[1]));

const images=
[
...html.matchAll(
/<img[^>]*>/gi
)
]
.map(x=>x[0]);

const imagesWithoutAlt=
images.filter(
img=>
!/alt=["'][^"]+["']/i.test(img)
);

const links=
[
...html.matchAll(
/<a[^>]+href=["']([^"]+)["']/gi
)
]
.map(x=>x[1]);

const hostname=
targetUrl.hostname;

const internalLinks=
links.filter(link=>{

try{

const u=
new URL(
link,
targetUrl
);

return u.hostname===hostname;

}catch{

return false;

}

});

const externalLinks=
links.filter(link=>{

try{

const u=
new URL(
link,
targetUrl
);

return u.hostname!==hostname;

}catch{

return false;

}

});

let robots=false;

let sitemap=false;

try{

const robotsCheck=
await fetch(
`${targetUrl.origin}/robots.txt`
);

robots=
robotsCheck.ok;

}catch{}

try{

const sitemapCheck=
await fetch(
`${targetUrl.origin}/sitemap.xml`
);

sitemap=
sitemapCheck.ok;

}catch{}


const bodyText=
cleanText(html);

const wordCount=
bodyText
.split(" ")
.filter(Boolean)
.length;


const checks=[];

function addCheck(
name,
status,
message,
weight=5
){

checks.push({
name,
status,
message,
weight
});

}


addCheck(
"HTTP Status",
response.ok
?"pass"
:"fail",
response.status,
10
);

addCheck(
"robots.txt",
robots
?"pass"
:"warning",
robots
?"Found"
:"Missing",
8
);

addCheck(
"Sitemap",
sitemap
?"pass"
:"warning",
sitemap
?"Found"
:"Missing",
8
);

addCheck(
"Open Graph",
ogCount>0
?"pass"
:"warning",
`${ogCount} tags`,
6
);

addCheck(
"Twitter Card",
twitterCount>0
?"pass"
:"warning",
`${twitterCount} tags`,
6
);

addCheck(
"Favicon",
favicon
?"pass"
:"warning",
favicon||"Missing",
5
);

addCheck(
"Hreflang",
hreflangCount>0
?"pass"
:"warning",
`${hreflangCount} found`,
5
);

addCheck(
"H1",
h1s.length===1
?"pass"
:"warning",
`${h1s.length} found`,
8
);

addCheck(
"H2",
h2s.length>0
?"pass"
:"warning",
`${h2s.length} found`,
6
);

addCheck(
"Image ALT",
imagesWithoutAlt.length===0
?"pass"
:"warning",
`${imagesWithoutAlt.length} missing`,
6
);

addCheck(
"Schema",
schemaCount>0
?"pass"
:"warning",
`${schemaCount} found`,
6
);

addCheck(
"Content",
wordCount>500
?"pass"
:"warning",
`${wordCount} words`,
8
);


const total=
checks.reduce(
(a,b)=>a+b.weight,
0
);

const earned=
checks.reduce(
(sum,item)=>{

if(item.status==="pass")
return sum+item.weight;

if(item.status==="warning")
return sum+item.weight*.5;

return sum;

},
0
);

const score=
Math.round(
earned/total*100
);


return res.status(200).json({

url:targetUrl.toString(),

finalUrl:response.url,

responseTime,

score,

title,

metaDescription,

canonical,

favicon,

h1Count:h1s.length,

h2Count:h2s.length,

imageCount:images.length,

imagesWithoutAlt:
imagesWithoutAlt.length,

schemaCount,

internalLinks:
internalLinks.length,

externalLinks:
externalLinks.length,

robots,

sitemap,

ogCount,

twitterCount,

hreflangCount,

wordCount,

checks

});

}catch(error){

return res.status(500).json({

error:error.message

});

}

}
