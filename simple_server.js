// 가장 간단한 서버 테스트
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    
    if (req.url === '/health') {
        res.end(JSON.stringify({
            status: 'healthy',
            message: 'Simple server working'
        }));
    } else {
        res.end(JSON.stringify({
            success: true,
            message: 'Server is running',
            url: req.url
        }));
    }
});

const port = 3001;
server.listen(port, '127.0.0.1', () => {
    console.log(`Simple server running on http://127.0.0.1:${port}`);
});