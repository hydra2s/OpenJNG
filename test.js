(async()=>{

    var jng = new OpenJNG();
    document.body.appendChild(await (await jng.load("./img/glenn99p.jng")).recodePNG());

})();
