package com.jplearn.pocnative

import android.content.Context
import androidx.ink.brush.Brush
import androidx.ink.brush.ExperimentalInkCustomBrushApi
import androidx.ink.storage.BrushFamilySerialization
import androidx.ink.storage.StrokeInputBatchSerialization
import androidx.ink.strokes.Stroke
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Insert
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

// A Stroke is really three things: the Brush used, the raw StrokeInputBatch
// (every sampled point — x, y, pressure, tilt, orientation, time), and a
// computed mesh. Persisting pixels would be lossy and non-editable; instead
// this stores the brush family + raw inputs (both via ink-storage's own
// serializers) plus the brush's plain scalar fields, and rebuilds the exact
// same Stroke on load via Stroke(brush, inputs) — a deterministic
// recomputation from the same two inputs, not an approximation.
@Entity(tableName = "strokes")
data class StrokeEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val createdAtMillis: Long,
    val colorIntArgb: Int,
    val size: Float,
    val epsilon: Float,
    val brushFamilyBytes: ByteArray,
    val strokeInputBytes: ByteArray,
)

@Dao
interface StrokeDao {
    @Insert
    suspend fun insert(entity: StrokeEntity)

    @Query("SELECT * FROM strokes ORDER BY id ASC")
    suspend fun getAll(): List<StrokeEntity>

    @Query("DELETE FROM strokes")
    suspend fun deleteAll()
}

@Database(entities = [StrokeEntity::class], version = 1, exportSchema = false)
abstract class StrokeDatabase : RoomDatabase() {
    abstract fun strokeDao(): StrokeDao

    companion object {
        @Volatile private var instance: StrokeDatabase? = null

        fun get(context: Context): StrokeDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    StrokeDatabase::class.java,
                    "strokes.db",
                ).build().also { instance = it }
            }
    }
}

@OptIn(ExperimentalInkCustomBrushApi::class)
fun Stroke.toEntity(): StrokeEntity {
    val familyOut = ByteArrayOutputStream()
    BrushFamilySerialization.encode(brush.family, familyOut)

    val inputsOut = ByteArrayOutputStream()
    StrokeInputBatchSerialization.encode(inputs, inputsOut)

    return StrokeEntity(
        createdAtMillis = System.currentTimeMillis(),
        colorIntArgb = brush.colorIntArgb,
        size = brush.size,
        epsilon = brush.epsilon,
        brushFamilyBytes = familyOut.toByteArray(),
        strokeInputBytes = inputsOut.toByteArray(),
    )
}

@OptIn(ExperimentalInkCustomBrushApi::class)
fun StrokeEntity.toStroke(): Stroke {
    val family = BrushFamilySerialization.decode(ByteArrayInputStream(brushFamilyBytes))
    val inputs = StrokeInputBatchSerialization.decode(ByteArrayInputStream(strokeInputBytes))
    val brush = Brush.createWithColorIntArgb(family, colorIntArgb, size, epsilon)
    return Stroke(brush, inputs)
}
