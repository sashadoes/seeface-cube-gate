# Seeface Cube Gate

A password-gate game: spin the cube, and every spin locks in a digit. Crack today's code to get in.
The prototype was extracted from `../my-evershop-app` and now runs standalone.

```bash
npm install
npm run dev
```

- http://localhost:5173 opens the riddle screen first, then "enter it now" opens the cube
- http://localhost:5173/?screen=cube goes straight to the cube

**Agents start here:** [AGENTS.md](AGENTS.md) has the goal, how the code works, known bugs and the target design.
