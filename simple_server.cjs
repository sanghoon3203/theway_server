// 가장 간단한 서버 테스트
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    
    if (req.url === '/health') {
        res.end(JSON.stringify({
            status: 'healthy',
            message: 'Simple server working',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.end(JSON.stringify({
            success: true,
            message: 'Server is running',
            url: req.url,
            timestamp: new Date().toISOString()
        }));
    }
});

const port = 3001;
server.listen(port, '127.0.0.1', () => {
    console.log(`✅ Simple server running on http://127.0.0.1:${port}`);
    console.log(`📍 Health check: http://127.0.0.1:${port}/health`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`⚠️  Port ${port} is in use`);
    } else {
        console.error('❌ Server error:', err);
    }
});