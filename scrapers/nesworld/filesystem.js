const AdmZip = require('adm-zip');
const fs = require('fs');
const http = require('http');
const log = require('./log');
const path = require('path');

const url = 'http://www.nesworld.com/';
const base = path.resolve(__dirname, 'entries');

exports.push = (meta) => {
    if (fs.existsSync(base)) rimraf(base);
    fs.mkdirSync(base);

    log.title('Creating directories and downloading assets based on Meta');

    const promises = [];
    for (let i = 0; i < meta.length; i++) {
        promises.push(handleGameMeta(meta[i]));
    }
    return Promise.all(promises);
}

async function handleGameMeta(game) {
    const gamePath = path.resolve(base, game.slug);
    fs.mkdirSync(gamePath);

    // Download Screenshots
    for (let i = 0; i < game.screenshots.length; i++) {
        const screenshotFilename = cleanPath(game.screenshots[i]);
        await download(url + game.screenshots[i], path.resolve(gamePath, screenshotFilename));
        game.screenshots[i] = screenshotFilename;
    }

    // Download ROM zip and extract
    const romZipFilename = cleanPath(game.rom);
    await download(url + game.rom, path.resolve(gamePath, romZipFilename));
    const romName = unzip(game.slug, path.resolve(gamePath, romZipFilename));

    game.rom = romName ? romName : '??????';

    fs.writeFileSync(path.resolve(gamePath, 'game.json'), JSON.stringify(game, null, 4));
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        http.get(url, function (response) {
            response.pipe(file);
            file.on('finish', function () {
                file.close(() => {
                    resolve();
                });
            });
        }).on('error', function (err) { // Handle errors
            fs.unlink(dest); // Delete the file async. (But we don't check the result)
            if (err) {
                log.error(url, err, dest);
                reject(err.message);
            }
        });
    });
};

function unzip(slug, zipFilePath) {
    let stage = 'Loading ZIP: ' + zipFilePath;
    try {
        const slugFilePath = path.resolve(base, slug);
        const zip = new AdmZip(zipFilePath);

        // Get possible ROM files
        stage = 'Getting possible ROMs in ZIP file: ' + zipFilePath;
        const possibleRoms = zip.getEntries().map(e => e.entryName).filter(e => /\.c?gbc?$/g.test(e.toLowerCase()));
        if (possibleRoms.length > 1) {
            log.warn(`Multiple possible ROMs found for '${slug}' (game.json will need updated): Count ${possibleRoms.length}`);
        } else if (possibleRoms.length === 0) {
            throw new Error('No possible ROMs found');
        }

        // Extract Zip
        const extractedFilePath = path.resolve(slugFilePath, 'zip');
        stage = 'Extracting all contents of ZIP to: ' + extractedFilePath;
        zip.extractAllTo(extractedFilePath);

        // Move ROMs to Root
        for (let i = 0; i < possibleRoms.length; i++) {
            const oldFilePath = path.normalize(path.resolve(extractedFilePath, possibleRoms[i]));
            const newFilePath = path.normalize(path.resolve(slugFilePath, cleanName(cleanPath(possibleRoms[i]))));
            stage = 'Moving ROM from \"' + oldFilePath + '\" to \"' + newFilePath;
            fs.renameSync(oldFilePath, newFilePath);
        }

        // Delete Zip and other extracted contents
        stage = 'Deleting ZIP file: ' + zipFilePath;
        fs.unlinkSync(zipFilePath);
        stage = 'Deleting extracted contents: ' + extractedFilePath;
        rimraf(extractedFilePath);

        // Try and determine main ROM file
        stage = 'Trying to determine the main ROM file'
        const roms = possibleRoms.map(e => cleanName(cleanPath(e)));
        if (roms.length > 1) {
            return undefined;
        } else if (roms.length === 1) {
            return roms[0];
        }
    } catch (e) {
        log.error(slug, e, stage);
    }
}

function cleanPath(p) {
    return path.basename(p);
}

function cleanName(n) {
    return n.toLowerCase().replace(/[\s\/]/g, '-').replace(/[^\w\-\.]/g, '');
}

function rimraf(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(function(entry) {
            var entryPath = path.join(dirPath, entry);
            if (fs.lstatSync(entryPath).isDirectory()) {
                rimraf(entryPath);
            } else {
                fs.unlinkSync(entryPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}
