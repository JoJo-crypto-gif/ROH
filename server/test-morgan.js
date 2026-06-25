import express from 'express';
import morgan from 'morgan';
const app = express();
morgan.token('user', (req) => req.user?.id || 'anonymous');
app.use(morgan(':method :url :status :response-time ms - :user', {
  stream: { write: (msg) => console.log("MORGAN LOG:", msg.trim()) }
}));
app.get('/test', (req, res) => res.json({ok: true}));
app.listen(4001, () => {
  console.log('Test server on 4001');
});
