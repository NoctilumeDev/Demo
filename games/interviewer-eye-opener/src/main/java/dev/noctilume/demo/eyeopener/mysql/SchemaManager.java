package dev.noctilume.demo.eyeopener.mysql;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

public final class SchemaManager {
    private static final String RESOURCE = "/db/schema.sql";

    private SchemaManager() {
    }

    public static void createSchema(JdbcConnectionFactory connections) {
        String script = readScript();
        try (Connection connection = connections.open(); Statement statement = connection.createStatement()) {
            for (String sql : script.split(";")) {
                if (!sql.isBlank()) {
                    statement.execute(sql.strip());
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot create MySQL schema", e);
        }
    }

    private static String readScript() {
        try (InputStream input = SchemaManager.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("Missing schema resource: " + RESOURCE);
            }
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read schema resource", e);
        }
    }
}
