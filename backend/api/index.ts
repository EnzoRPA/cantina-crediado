import app from '../src/app';

const port = parseInt(process.env.PORT || '3000', 10);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export default app;
