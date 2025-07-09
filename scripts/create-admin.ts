import { connectDB } from "../src/configs/db.config";
import logger from "../src/configs/logger.config";
import readline from 'readline';
import { AuthService } from "../src/crm/utils/auth.util";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function createAdmin() {
    try {
        await connectDB();

        rl.question('Enter username: ', async (username) => {
            rl.question('Enter password: ', async (password) => {
                try {
                    const user = await AuthService.register(username, password, 'admin');
                    logger.info(`Admin user created successfully: ${username}`);
                    console.log(`Admin user created successfully: ${username}`);
                } catch (error) {
                    logger.error('Failed to create admin user:', error);
                    console.error('Error:', error.message);
                } finally {
                    rl.close();
                    process.exit(0);
                }
            });
        });
    } catch (error) {
        logger.error('Failed to connect to database:', error);
        console.error('Error:', error.message);
        process.exit(1);
    }
}

createAdmin();