const http = require('http');
const fs = require('fs');
const path = require('path');
const { getVideoDurationInSeconds } = require('get-video-duration');
const playListGenerator = require('./helpers/playlistGenerator');
const mediaFinder = require('./helpers/mediaFinder');

const PORT = 3000;
const VIDEO_EXT = 'ts';
const SEGMENT_SIZE = 5000000;

const videoSegmentStream = (videoFilePath, sequence, segmentSize, isEnd) => {
    if(!fs.existsSync(videoFilePath)) return {error: 'File not found'};
    const start = sequence * segmentSize;
    const options = { start };

    if (!isEnd) {
        const end = start + segmentSize - 1;
        options.end = end;
    }

    return fs.createReadStream(videoFilePath, options);
};

const server = http.createServer( async (req, res) => {
    if(req.method === 'GET' && req.url.match(/.m3u8$/)){
        const mediaName = req.url.replace('/','').split('.')[0];
        const { videoFilePath } = mediaFinder('local', mediaName);
        if (!videoFilePath) {
            const headers = {'Content-Type': 'application/json'};
            res.writeHead(404, headers);
            res.write('{"msg":"Media not found"}');
            return res.end();
        };

        const size = fs.statSync(videoFilePath).size;
        const videoDurationInSeconds = await getVideoDurationInSeconds(videoFilePath);
        const playlist = playListGenerator(size, SEGMENT_SIZE, 'ts', videoDurationInSeconds, mediaName, 'video');
        const headers = {
            'Content-Type':'text',
            'Content-Disposition':'attachment; playlist.m3u8'
        };
        res.writeHead(200, headers);
        res.write(playlist);
        res.end();

    } else if (req.method === 'GET' && req.url.match(`.${VIDEO_EXT}`)){
        const [ emptyStr, mediaName, stream, sequenceRequested ] = req.url.split('/');
        const { videoFilePath } = mediaFinder('local', mediaName);
        if (!videoFilePath) {
            const headers = {'Content-Type': 'application/json'};
            res.writeHead(404, headers);
            res.write('{"msg":"Video not found"}');
            return res.end();
        };

        console.log(`Video segment requested: ${req.url}`);

        const headers = {
            'Content-Type': 'application/vnd.apple.mpegurl'
        };
        
        let sequence, readStream;
        if (sequenceRequested.includes("end")) {
            sequence = sequenceRequested.replace(`-end.${VIDEO_EXT}`, "").replace("seq-", "");
            readStream = videoSegmentStream(videoFilePath, sequence, SEGMENT_SIZE, true);
        } else {
            sequence = +sequenceRequested.replace(`.${VIDEO_EXT}`, "").replace("seq-", "");
            readStream = videoSegmentStream(videoFilePath, sequence, SEGMENT_SIZE, false);
        }

        readStream.on('end', () => console.log(`Video segment sent: ${req.url.replace('/', '')}`)); // This should be done in the writestream

        if(readStream.error) {
            res.writeHead(500);
            return res.end();
        };

        res.writeHead(200, headers);
        readStream.pipe(res);
    } else {
        res.writeHead(404); // Default will always be 200
    };
});

server.listen( PORT, () => console.log(`HLS server listen at port: ${PORT}`));